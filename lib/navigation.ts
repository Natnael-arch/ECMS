export type NavigationItem = { label: string; href: string };
export type NavigationSection = { label: string; items: NavigationItem[] };
export type NavigationModule = {
  label: string;
  href: string;
  sections: NavigationSection[];
};

export const navigationModules: NavigationModule[] = [
  {
    label: 'Dashboard', href: '/dashboard', sections: [
      { label: 'Overview', items: [
        { label: 'Executive Summary', href: '/dashboard' },
        { label: 'S-Curve & Progress', href: '/dashboard?tab=curve' },
      ] },
    ],
  },
  {
    label: 'Projects', href: '/projects', sections: [
      { label: 'Projects', items: [
        { label: 'Project Register', href: '/projects' },
      ] },
    ],
  },
  {
    label: 'Contracts', href: '/contracts', sections: [
      { label: 'Contract Management', items: [
        { label: 'Contract Register', href: '/contracts' },
      ] },
    ],
  },
  {
    label: 'Cost & BOQ', href: '/cost-and-boq', sections: [
      { label: 'Cost', items: [
        { label: 'Cost Codes', href: '/cost-and-boq' },
        { label: 'BOQ Explorer', href: '/cost-and-boq/boq' },
        { label: 'Variations', href: '/cost-and-boq/variations' },
      ] },
    ],
  },
  {
    label: 'Field Operations', href: '/field', sections: [
      { label: 'Field', items: [
        { label: 'Measurements', href: '/field' },
        { label: 'Inspections', href: '/field/inspections' },
        { label: 'Daywork', href: '/field/daywork' },
      ] },
    ],
  },
  {
    label: 'IPCs & Payments', href: '/ipcs', sections: [
      { label: 'Interim Payments', items: [
        { label: 'IPC Register', href: '/ipcs' },
      ] },
    ],
  },
  {
    label: 'Procurement', href: '/procurement', sections: [
      { label: 'Procurement', items: [
        { label: 'Suppliers', href: '/procurement' },
        { label: 'Requisitions', href: '/procurement/requisitions' },
        { label: 'Purchase Orders', href: '/procurement/orders' },
        { label: 'Goods Received', href: '/procurement/receipts' },
        { label: 'Invoices & Match', href: '/procurement/invoices' },
      ] },
    ],
  },
  {
    label: 'Stores & Materials', href: '/stores', sections: [
      { label: 'Stores', items: [
        { label: 'Stock Ledger', href: '/stores' },
        { label: 'Material Issues', href: '/stores/issues' },
        { label: 'Stock Counts', href: '/stores/counts' },
      ] },
    ],
  },
  {
    label: 'Workforce', href: '/workforce', sections: [
      { label: 'Workforce', items: [
        { label: 'Worker Roster', href: '/workforce' },
        { label: 'Attendance', href: '/workforce/attendance' },
        { label: 'Timesheets', href: '/workforce/timesheets' },
        { label: 'Payroll', href: '/workforce/payroll' },
      ] },
    ],
  },
  {
    label: 'Documents', href: '/documents', sections: [
      { label: 'Document Control', items: [
        { label: 'Document Register', href: '/documents' },
        { label: 'Transmittals', href: '/documents/transmittals' },
      ] },
    ],
  },
  {
    label: 'Issues & Controls', href: '/issues', sections: [
      { label: 'Governance', items: [
        { label: 'Issue Register', href: '/issues' },
        { label: 'RFIs', href: '/issues/rfis' },
        { label: 'Control Console', href: '/issues/controls' },
      ] },
    ],
  },
  {
    label: 'Reports', href: '/reports', sections: [
      { label: 'Reporting', items: [
        { label: 'Report Centre', href: '/reports' },
      ] },
    ],
  },
  {
    label: 'Imports', href: '/imports', sections: [
      { label: 'Data Import', items: [
        { label: 'Import Centre', href: '/imports' },
      ] },
    ],
  },
  {
    label: 'Administration', href: '/administration', sections: [
      { label: 'Administration', items: [
        { label: 'Overview', href: '/administration' },
        { label: 'Audit Trail', href: '/administration/audit' },
        { label: 'Users & Roles', href: '/administration/settings' },
      ] },
    ],
  },
];

export function getNavigationTrail(pathname: string) {
  for (const module of navigationModules) {
    for (const section of module.sections) {
      const item = section.items.find((entry) => entry.href === pathname);
      if (item) return { module, section, item };
    }
  }
  return undefined;
}
