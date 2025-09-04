# Toast Success Auto-dismiss and Click-away Acceptance Criteria

Branch: feature/toast-success-autodismiss-clickaway

Acceptance criteria:

1) Success toasts auto-dismiss exactly 1,000 ms after appearing.
2) Success toasts also dismiss when the user clicks anywhere outside the toast area.
3) No success toast can remain visible longer than 1,000 ms due to per-toast overrides.
4) Error, warning, and info toasts retain their current behavior and timing.
