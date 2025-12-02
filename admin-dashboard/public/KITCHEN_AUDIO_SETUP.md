# Kitchen Kiosk Audio Setup

The kitchen kiosk page expects an audio file at `/public/ding-dong.mp3` for the new order notification sound.

## Setup Instructions

1. Add a `ding-dong.mp3` file to the `public` folder
2. The file should be a short, clear notification sound (doorbell/ding-dong style)
3. Recommended: 1-2 seconds duration, loud and clear
4. The audio will play automatically when a new order arrives

## Alternative

If you don't have an audio file, you can:
- Use a free sound effect from freesound.org or similar
- Generate a simple tone using online tools
- Comment out the audio playback code in `KitchenView.js` if sound is not needed

## File Location

```
admin-dashboard/public/ding-dong.mp3
```





