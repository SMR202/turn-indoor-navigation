---
version: alpha
name: TURN
description: Indoor wayfinding and field surveying with a cartographic blue identity.
colors:
  primary: '#245CE5'
  ink: '#14283F'
  muted: '#53667A'
  background: '#F2F5FA'
  surface: '#FFFFFF'
  border: '#D7E0EC'
  success: '#12705B'
  danger: '#AF303B'
typography:
  sans:
    fontFamily: 'system-ui, sans-serif'
  data:
    fontFamily: 'Menlo, monospace'
rounded:
  DEFAULT: '14px'
  panel: '22px'
spacing:
  page: '20px'
  section: '18px'
components:
  Action:
    height: '50px'
    backgroundColor: '{colors.primary}'
    textColor: '{colors.surface}'
  Notice:
    padding: '14px'
    textColor: '{colors.ink}'
  Body:
    textColor: '{colors.muted}'
  Divider:
    backgroundColor: '{colors.border}'
  Success:
    textColor: '{colors.success}'
  Error:
    textColor: '{colors.danger}'
---

# TURN design system

Product register: a handheld indoor wayfinding app for venue testers, currently English, tested in Pakistan. Walking and surveying need large controls and clear state, rather than a dense debugging console. No Japan-market scope is inferred.

North star: a legible field instrument with the floor plan as its principal artifact. The signature is a blue directional mark and map-led navigation, with a persistent Navigate / Survey / Tests bar. Keep route setup sequential, survey progress explicit, and technical counts behind disclosures. Avoid decorative hero art, marketing claims, gradients and blocks of equally prominent buttons.

Runtime ownership: `apps/mobile/src/components/ui.tsx` is the canonical React Native theme and shared control implementation; this document mirrors its semantic tokens. Display uses the platform sans face at 32/38 bold with tight tracking; body is 15/23, headings 20/27. System fonts keep offline loading stable and respect device scaling. Monospace is reserved for measurement values.

Use white panels on a cool gray-blue field, blue primary actions and selected states. Danger and warnings always include text. Controls have pressed, disabled and keyboard-focus states; preserve at least 48-point targets. No ornamental animation; progress is time-based and remains readable with reduced motion. Light theme is the tested baseline.

The native ScrollView owns scrolling; never hide indicators. Browser scrollbars use the shared web baseline. Panels stack on narrow phones and have a bounded reading width on desktop. Lists wrap rather than requiring horizontal hunting. Native text inputs and pressable choice lists own data entry; no custom dropdown or modal is needed for this slice.

Mobbin reference search was attempted but access required a paid plan. No Mobbin reference images were viewed or copied.
