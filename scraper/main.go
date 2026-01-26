package main

import (
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Shared HTTP client with connection pooling - THE KEY TO WINNING
var sharedClient *http.Client

func init() {
	// Aggressive connection pooling for batch downloads
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
			MaxVersion: tls.VersionTLS13,
		},
		MaxIdleConns:        100,             // Keep many connections ready
		MaxIdleConnsPerHost: 10,              // Per-host pool
		MaxConnsPerHost:     10,              // Limit per host to be polite
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  false,
		TLSHandshakeTimeout: 10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
	}

	sharedClient = &http.Client{
		Timeout:   30 * time.Second,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
}

// Result types
type ScrapeResult struct {
	Success bool     `json:"success"`
	Images  []string `json:"images,omitempty"`
	Error   string   `json:"error,omitempty"`
}

type DownloadItem struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
	Size     int64  `json:"size,omitempty"`
}

type DownloadResult struct {
	Success   bool           `json:"success"`
	Total     int            `json:"total"`
	Completed int            `json:"completed"`
	Failed    int            `json:"failed"`
	Items     []DownloadItem `json:"items"`
	Duration  int64          `json:"duration_ms"`
	Error     string         `json:"error,omitempty"`
}

func main() {
	// Scrape mode
	urlFlag := flag.String("url", "", "URL to scrape")

	// Download mode
	downloadFlag := flag.Bool("download", false, "Enable batch download mode")
	urlsFlag := flag.String("urls", "", "Comma-separated URLs to download")
	outputFlag := flag.String("output", "", "Output directory for downloads")
	concurrencyFlag := flag.Int("concurrency", 8, "Max concurrent downloads")

	flag.Parse()

	if *downloadFlag {
		// Batch download mode
		if *urlsFlag == "" || *outputFlag == "" {
			outputDownloadError("urls and output are required for download mode")
			return
		}
		urls := strings.Split(*urlsFlag, ",")
		result := batchDownload(urls, *outputFlag, *concurrencyFlag)
		json.NewEncoder(os.Stdout).Encode(result)
	} else if *urlFlag != "" {
		// Scrape mode
		images, err := scrapeImages(*urlFlag)
		if err != nil {
			outputScrapeError(err.Error())
			return
		}
		outputScrapeSuccess(images)
	} else {
		outputScrapeError("url or download mode required")
	}
}

func outputScrapeSuccess(images []string) {
	result := ScrapeResult{Success: true, Images: images}
	json.NewEncoder(os.Stdout).Encode(result)
}

func outputScrapeError(msg string) {
	result := ScrapeResult{Success: false, Error: msg}
	json.NewEncoder(os.Stdout).Encode(result)
}

func outputDownloadError(msg string) {
	result := DownloadResult{Success: false, Error: msg}
	json.NewEncoder(os.Stdout).Encode(result)
}

// batchDownload - The main attraction. Go's goroutines + connection pooling
func batchDownload(urls []string, outputDir string, concurrency int) DownloadResult {
	startTime := time.Now()

	// Ensure output directory exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return DownloadResult{Success: false, Error: err.Error()}
	}

	// Semaphore for concurrency control
	sem := make(chan struct{}, concurrency)

	// Results channel
	results := make(chan DownloadItem, len(urls))

	var wg sync.WaitGroup

	for i, rawURL := range urls {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}

		wg.Add(1)
		go func(idx int, imageURL string) {
			defer wg.Done()

			// Acquire semaphore
			sem <- struct{}{}
			defer func() { <-sem }()

			// Generate filename
			filename := generateFilename(imageURL, idx)
			outputPath := filepath.Join(outputDir, filename)

			// Download with streaming
			size, err := downloadFile(imageURL, outputPath)

			item := DownloadItem{
				URL:      imageURL,
				Filename: filename,
			}

			if err != nil {
				item.Success = false
				item.Error = err.Error()
			} else {
				item.Success = true
				item.Size = size
			}

			results <- item
		}(i, rawURL)
	}

	// Close results channel when all done
	go func() {
		wg.Wait()
		close(results)
	}()

	// Collect results
	var items []DownloadItem
	completed := 0
	failed := 0

	for item := range results {
		items = append(items, item)
		if item.Success {
			completed++
		} else {
			failed++
		}
	}

	duration := time.Since(startTime).Milliseconds()

	return DownloadResult{
		Success:   failed == 0,
		Total:     len(urls),
		Completed: completed,
		Failed:    failed,
		Items:     items,
		Duration:  duration,
	}
}

// downloadFile - Stream directly to disk, no memory buffering
func downloadFile(imageURL, outputPath string) (int64, error) {
	req, err := http.NewRequest("GET", imageURL, nil)
	if err != nil {
		return 0, err
	}

	// Set headers
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "image/webp,image/apng,image/*,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := sharedClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Check content type
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "image") && contentType != "" {
		return 0, fmt.Errorf("not an image: %s", contentType)
	}

	// Create output file
	out, err := os.Create(outputPath)
	if err != nil {
		return 0, err
	}
	defer out.Close()

	// Stream copy - THIS IS KEY: no memory buffering, direct to disk
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		os.Remove(outputPath) // Cleanup partial file
		return 0, err
	}

	return written, nil
}

// generateFilename - Extract filename from URL or generate one
func generateFilename(imageURL string, index int) string {
	parsed, err := url.Parse(imageURL)
	if err != nil {
		return fmt.Sprintf("image_%d.jpg", index)
	}

	// Get the path component
	urlPath := parsed.Path
	filename := filepath.Base(urlPath)

	// If no valid extension, add one
	ext := strings.ToLower(filepath.Ext(filename))
	validExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}

	if !validExts[ext] {
		filename = fmt.Sprintf("image_%d.jpg", index)
	}

	// Sanitize filename
	filename = strings.ReplaceAll(filename, ":", "_")
	filename = strings.ReplaceAll(filename, "?", "_")
	filename = strings.ReplaceAll(filename, "&", "_")

	return filename
}

// ============ SCRAPE MODE (existing functionality) ============

func scrapeImages(targetURL string) ([]string, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}

	// Set headers
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7")

	// PTT needs over18 cookie
	if strings.Contains(parsedURL.Host, "ptt.cc") {
		req.Header.Set("Cookie", "over18=1")
	}

	resp, err := sharedClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	html := string(body)
	images := extractImages(html, parsedURL)

	return images, nil
}

func extractImages(html string, baseURL *url.URL) []string {
	imageSet := make(map[string]bool)
	var mu sync.Mutex

	// Patterns to extract
	patterns := []string{
		// img src
		`<img[^>]+src=["']([^"']+)["']`,
		// srcset
		`srcset=["']([^"']+)["']`,
		// og:image
		`<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`,
		`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']`,
		// background-image
		`background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)`,
		// Direct image links (common on forums like PTT)
		`href=["'](https?://[^"']+\.(?:jpg|jpeg|png|gif|webp))["']`,
		// imgur links
		`(https?://(?:i\.)?imgur\.com/[a-zA-Z0-9]+\.(?:jpg|jpeg|png|gif|webp))`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindAllStringSubmatch(html, -1)
		for _, match := range matches {
			if len(match) > 1 {
				// For srcset, split by comma and get URLs
				if strings.Contains(pattern, "srcset") {
					srcsetParts := strings.Split(match[1], ",")
					for _, part := range srcsetParts {
						part = strings.TrimSpace(part)
						fields := strings.Fields(part)
						if len(fields) > 0 {
							addImage(imageSet, &mu, fields[0], baseURL)
						}
					}
				} else {
					addImage(imageSet, &mu, match[1], baseURL)
				}
			}
		}
	}

	// Convert set to slice
	var images []string
	for img := range imageSet {
		images = append(images, img)
	}

	return images
}

func addImage(imageSet map[string]bool, mu *sync.Mutex, imgURL string, baseURL *url.URL) {
	// Normalize URL
	imgURL = strings.TrimSpace(imgURL)

	if imgURL == "" {
		return
	}

	// Skip data URLs and tiny tracking images
	if strings.HasPrefix(imgURL, "data:") ||
		strings.Contains(imgURL, "1x1") ||
		strings.Contains(imgURL, "pixel") ||
		strings.Contains(imgURL, "tracking") ||
		strings.Contains(imgURL, "spacer") {
		return
	}

	// Handle protocol-relative URLs
	if strings.HasPrefix(imgURL, "//") {
		imgURL = "https:" + imgURL
	}

	// Handle relative URLs
	if strings.HasPrefix(imgURL, "/") {
		imgURL = baseURL.Scheme + "://" + baseURL.Host + imgURL
	}

	// Skip non-http URLs
	if !strings.HasPrefix(imgURL, "http") {
		return
	}

	mu.Lock()
	imageSet[imgURL] = true
	mu.Unlock()
}
