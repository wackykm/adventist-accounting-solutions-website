// Ledge configuration. Fill these in after registering the app in Entra (see README).
// While clientId still starts with "YOUR", Ledge runs in demo mode with sample data.
window.LEDGE_CONFIG = {
  tenantId: "612ebefe-ed88-4303-bddb-a9855dbb6d89",          // Entra admin center > Overview > Tenant ID
  clientId: "4c4a9966-4c4a-465a-8f60-88db15cf56f1",      // Entra > App registrations > Ledge > Application (client) ID

  // Anyone signing in with one of these email domains sees the StoreUp view.
  storeUpDomains: ["storeupfinancials.com"],

  // One SharePoint site per school. Only that school's guests (and StoreUp) can open it.
  schools: [
    {
      id: "sva",
      name: "Shenandoah Valley Academy",
      place: "New Market, VA",
      siteHost: "storeupfinancials.sharepoint.com",   // e.g. storeupfinancials.sharepoint.com
      sitePath: "/sites/SVA-Ledge",
      emailDomains: ["svasda.org"]      // mail forwarded from these domains lands in this school's inbox
    }
  ],

  // Shared mailbox that schools and StoreUp forward receipts to.
  inbox: "ledge@storeupfinancials.com",

  // Sign people out after this many minutes without activity.
  idleMinutes: 30
};
