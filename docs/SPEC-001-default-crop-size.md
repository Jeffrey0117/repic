# SPEC-001: Default Crop Size to Full Image

## Overview
When entering crop mode, the crop area should default to the full image size instead of no selection.

## Requirements
1. When ImageCropper component mounts with an image, initialize crop to cover 100% of the image
2. Crop should be set with: x=0, y=0, width=100, height=100 (percentage-based)
3. User can then adjust the crop area from there

## Implementation
- File: `src/features/editor/ImageCropper.jsx`
- Modify the initial crop state or useEffect to set default crop when image loads

## Acceptance Criteria
- [ ] Opening crop mode shows crop selection covering entire image
- [ ] User can immediately see and adjust the crop handles
- [ ] No change to existing crop behavior once user interacts
