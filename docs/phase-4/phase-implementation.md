# Phase 4 Implementation Plan

Based on the requirements outlined in the Phase 4 plan, here is the technical breakdown for the implementation:

## 1. Sample Clearance PDF in Download Modal
We need to provide users with access to the sample clearance PDF directly from the download (install) modal.

**Steps:**
1. **Asset Management:** Copy the actual PDF file from `/home/lmb/mounts/T7/Music/fl-studio-assets/loop-kits/Miguel.b beats sample clearence.pdf` into the `app/public/` directory as `sample-clearance.pdf` so it can be served statically by Next.js.
2. **Modal UI Update (`app/src/app/install-modal.tsx`):**
   - Add a UI element (e.g., a link or button) titled "Click here to view sample clearance".
   - Upon clicking, we will display an embedded PDF viewer directly in the modal. This can be achieved seamlessly using an `<iframe src="/sample-clearance.pdf" />` that toggles into view, or replacing the current modal view with the PDF view.
   - We will ensure this fits cleanly within the modal's current layout without overflowing.

## 2. Professional Custom Audio Player
The default HTML `<audio controls>` element doesn't fit the polished look of professional beat marketplaces like Splice or Wavs. We will build a custom player UI.

**Steps:**
1. **Remove Default Controls:** In `app/src/app/player-bar.tsx`, remove the `controls` attribute from the `<audio>` element.
2. **State Management:**
   - Add local React state for `currentTime` and `duration`.
   - Bind `onTimeUpdate` and `onLoadedMetadata` events on the `<audio>` element to update these states in real-time.
3. **Custom UI Components:**
   - **Progress Bar:** Create a sleek, clickable progress bar (using an `<input type="range">` styled with CSS or a custom div implementation) that allows users to seek through the track.
   - **Timestamps:** Display formatted time numbers (e.g., `1:23 / 3:45`).
   - **Play/Pause Button:** Enhance the current play/pause button to be more prominent and stylized.
   - **Volume Control (Optional but recommended):** Add a volume slider or mute toggle for better user experience.
4. **Styling:** Use Tailwind CSS to craft a meticulously designed, dark-themed player bar with sharp borders and distinct accent colors (similar to the current minimalist aesthetic but more feature-rich).
