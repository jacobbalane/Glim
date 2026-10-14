# Horizontal island dragging

Hold the compact preview or an expanded view's header for 350 ms, then drag left or right. Release to save its position. A short click still opens or collapses the island. Escape or losing focus cancels the drag. Alt + Left/Right moves a focused preview by 24 pixels.

The island stays attached to the top edge. Travel leaves 20 pixels beside its expanded width, so opening at either end never clips it. The normalized position is saved with preferences and adapts to the selected display's width and scaling. Other settings preserve the position.

## Quick options

Quick options are **hidden by default**. In **Settings → Island → Quick options**, enable them, select actions, and drag the rows into order. All six rows are draggable, including unselected actions. Space picks up a focused row, arrow keys move it, Space drops it, and Escape cancels. Selection and order persist when disabled and after restarting.

Available shortcuts:

- Centre horizontally
- Pause / Resume monitoring
- Settings
- Usage history
- Connect agents
- Quit Glim

Centre and Quit are selected initially. Selecting no actions hides the pill. Centre also appears under **Settings → Island → Position**; Quit sits beside Releases in the Settings footer and remains in the tray menu. The browser preview disables Quit.

Hover over the collapsed preview for **500 ms** to reveal a small black **⋯** button. Click it to slide the selected action icons into the same pill. Keyboard focus reveals the button immediately. Right click and Shift + F10 open the enabled shortcuts. Brief pointer crossings never reveal it. Clicking ⋯ again, Escape, clicking outside, or losing focus closes the actions. Expanding or dragging hides the hover button.

## Website interaction changes

- Long press on the preview or header enables horizontal dragging; release does not open or collapse it. The cursor becomes a grabbing hand.
- The full message panel opens on the left when it cannot fit to the right and fits to the left.
- Quick options default to disabled. Add the Settings switch and selectable, draggable action rows. New preference fields: `quickOptionsEnabled` (false), `quickOptions` (initially centre and quit), and `quickOptionsOrder` (centre, pause, settings, usage, setup, quit).
- The options button fades in after 500 ms of hovering, or immediately on keyboard focus. The fade takes 150 ms (60 ms with reduced motion), with no movement, scaling, or connecting shape. A transparent bridge keeps it reachable across the four-pixel gap, including in the native pointer region.
- The flat black pill is **26 pixels tall**, sits four pixels below the top edge, and has a 13-pixel radius. Each control is **32 × 26 pixels** with four pixels between controls. Action icons are 12 pixels; ⋯ is 14 pixels. Width is `32 + 36 × selected action count`: 104 pixels for the default two actions, up to 248 for all six. It has no shadow, glow, hover background, visible labels or tooltips.
- On the right it grows rightwards, keeping the trigger anchored. Near the right screen edge it sits on the island's left and grows leftwards. In a narrow browser preview where neither side fits, it stays horizontal below the island and inside the viewport. Options opened from an expanded header sit inside its upper right corner.
- The pill uses the island's spring (420 stiffness, 40 damping, mass 1); actions slide eight pixels and fade over 150 ms. Reduced motion resizes immediately and fades for 60 ms. Exiting controls become inert immediately. The main island retains its dimensions unless an action navigates to Settings, Usage or Setup.
- Centre uses Google's official [Material Align Horizontal Center icon](https://github.com/google/material-design-icons/blob/master/src/editor/align_horizontal_center/materialicons/24px.svg). It glides to the middle with an 800 ms spring and no bounce, with the native pointer region following. A short click still opens the island during this movement; a long press interrupts it for dragging. Reduced motion centres immediately.
- Settings choices expand and collapse smoothly. Dragged rows stay under the pointer and siblings spring into their new positions. Disk writes happen on drop, with optimistic selection and rollback on a failed save.
- Escape returns focus to the options button. Outside clicks, Tab to another control, or losing window focus dismiss it. Arrow keys navigate enabled actions; accessible names identify them.
- The collapsed preview, hidden-notice counter and options button have no hover text or native title tooltips. Their accessible labels remain available.
- Single clicks still respond immediately. Double click no longer opens options.

The local website imports the shared renderer. Its `AppIsland` wrapper must provide `position` and `onPosition` to enable dragging. Pass an optional `options` array of `QuickAction` entries (`id`, `label`, `Icon`, and optional async `run`) for the selected shortcuts in saved order; omit it when disabled. Use `selectedQuickOptions` and `quickAction` from `src/quick-options.tsx` to build the array. Omitting `run` disables an action such as Quit on a website. A separately maintained preview needs these changes applied there too.

## Desktop behavior

The transparent host spans the selected display's work area. The visible surface moves inside it, and the native pointer region follows the same horizontal offset. When the hover button appears, the side region includes it and a short overlapping bridge to the island; revealing the icons extends that region to follow the animated pill. Closing shrinks it with the surface. The collector's periodic positioning keeps the host attached to that display without resetting the surface. Long holds activate native focus for pointer capture, and open actions activate it for keyboard use and outside-window dismissal. Releasing or dismissing restores the compact window's focus behavior.

Browser tests cover default visibility, selection, pointer and keyboard ordering, cancellation, save errors, clicks, hold cancellation, centring interruption, hover delay, both screen edges, narrow previews, reduced motion, keyboard movement and side-panel placement. Rust tests cover persistence, old settings compatibility and moved Windows hit regions at 100%, 125%, 150% and 200% scaling. Real pointer capture across desktop windows needs an interactive desktop check.
