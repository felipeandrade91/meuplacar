# Architecture rules
- Use the shared MatchDatePicker for match and highlight dates so both provide an accessible localized calendar.
- Use recent-matches helpers to order games by date, creation timestamp and ID before selecting recent windows; this keeps results stable across inserts and reloads.