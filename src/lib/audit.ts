// Audit mode toggle.
//
// While AUDIT_MODE is true, all delete buttons / trash icons across every role
// (Account, Logistic, HR, Marketer, Sales, Director, Admin) are hidden in the UI.
// The underlying handlers still exist — only the trigger is hidden.
//
// To re-enable deletes after the audit, set this to false and ship.
export const AUDIT_MODE = true;
