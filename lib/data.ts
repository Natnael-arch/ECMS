export type ProjectStatus = 'On Track' | 'At Risk' | 'Delayed';

export interface Project {
  id: string;
  name: string;
  client: string;
  contractValue: number;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  progress: number;
  pm: string;
  supervisor: string;
  consultant: string;
  type: string;
  contractType: string;
  contractor?: string;
  projectManager?: string;
}

export const projects: Project[] = [
  {
    id: 'p1',
    name: 'Bole Commercial Tower',
    client: 'Sunrise Developers PLC',
    contractValue: 60000000,
    startDate: 'Jan 2025',
    endDate: 'Dec 2026',
    status: 'On Track',
    progress: 72,
    contractor: 'MEEKA Technologies PLC',
    projectManager: 'Yonas Alemu',
    pm: 'Yonas Alemu',
    supervisor: 'Tesfaye Girma',
    consultant: 'Addis Design Group',
    type: 'G+12 Commercial',
    contractType: 'Lump Sum',
  },
  {
    id: 'p2',
    name: 'Adama Road Rehabilitation',
    client: 'Ethiopian Roads Authority',
    contractValue: 68000000,
    startDate: 'Mar 2025',
    endDate: 'Sep 2026',
    status: 'At Risk',
    progress: 48,
    pm: 'Yonas Alemu',
    supervisor: 'Tesfaye Girma',
    consultant: 'Unknown',
    type: 'Infrastructure',
    contractType: 'Unit Price',
  },
  {
    id: 'p3',
    name: 'Hawassa Industrial Park',
    client: 'Industrial Parks Development Corp.',
    contractValue: 20000000,
    startDate: 'Jun 2025',
    endDate: 'Mar 2027',
    status: 'On Track',
    progress: 63,
    pm: 'Yonas Alemu',
    supervisor: 'Tesfaye Girma',
    consultant: 'Unknown',
    type: 'Industrial',
    contractType: 'Lump Sum',
  }
];

export const dashboardKPIs = {
  activeProjects: 3,
  totalContractValue: 148000000,
  avgCompletion: 61,
  budgetConsumed: 67
};

export const notifications = [
  { id: 'n1', text: 'Cost alert: Superstructure exceeds 80%', type: 'alert', time: '2h ago' },
  { id: 'n2', text: 'Material request: 12t Rebar Ø16 pending approval', type: 'info', time: '4h ago' },
  { id: 'n3', text: 'Document updated: BCT-STR-001 Rev.04 issued', type: 'success', time: '1d ago' },
];

export const ganttActivities = [
  { id: 'a1', name: 'Site preparation', start: 'Jan', end: 'Jan', actualStart: 'Jan', actualEnd: 'Jan', progress: 100 },
  { id: 'a2', name: 'Excavation & earthwork', start: 'Feb', end: 'Mar', actualStart: 'Feb', actualEnd: 'Mar', progress: 100 },
  { id: 'a3', name: 'Foundation works', start: 'Apr', end: 'Jun', actualStart: 'Apr', actualEnd: 'Jul', progress: 100 },
  { id: 'a4', name: 'Superstructure', start: 'Jul', end: 'Oct', actualStart: 'Aug', actualEnd: 'Oct', progress: 45 },
  { id: 'a5', name: 'Masonry & blockwork', start: 'Sep', end: 'Nov', actualStart: 'Oct', actualEnd: 'Nov', progress: 20 },
  { id: 'a6', name: 'MEP installation', start: 'Oct', end: 'Dec', actualStart: null, actualEnd: null, progress: 0 },
  { id: 'a7', name: 'Finishing works', start: 'Nov', end: 'Dec', actualStart: null, actualEnd: null, progress: 0 },
];

export const sCurveData = [
  { month: 'Jan', planned: 2, actual: 2 },
  { month: 'Feb', planned: 5, actual: 5 },
  { month: 'Mar', planned: 12, actual: 11 },
  { month: 'Apr', planned: 22, actual: 20 },
  { month: 'May', planned: 35, actual: 30 },
  { month: 'Jun', planned: 48, actual: 42 },
  { month: 'Jul', planned: 60, actual: 51 },
  { month: 'Aug', planned: 70, actual: 61 },
  { month: 'Sep', planned: 80, actual: null },
  { month: 'Oct', planned: 88, actual: null },
  { month: 'Nov', planned: 95, actual: null },
  { month: 'Dec', planned: 100, actual: null },
];

export const costCodes = [
  { name: 'Substructure', actual: 8.1, budget: 8.5 },
  { name: 'Superstructure', actual: 18.5, budget: 22 },
  { name: 'Masonry', actual: 3.8, budget: 6.2 },
  { name: 'MEP', actual: 1.2, budget: 9.8 },
  { name: 'Finishing', actual: 0.4, budget: 7.5 },
  { name: 'Preliminaries', actual: 4.2, budget: 6 },
];

export const materials = [
  { id: 'm1', name: 'Ordinary Portland Cement', unit: 'Bags', qty: 42, capacity: '1000', pct: 14, status: 'Low' },
  { id: 'm2', name: 'Reinforcement bar Ø12', unit: 'Tons', qty: 8.5, capacity: '15.4', pct: 55, status: 'Good' },
  { id: 'm3', name: 'Reinforcement bar Ø16', unit: 'Tons', qty: 3.2, capacity: '10', pct: 32, status: 'Medium' },
  { id: 'm4', name: 'Concrete blocks 20cm', unit: 'Pcs', qty: 1840, capacity: '2500', pct: 73, status: 'Good' },
  { id: 'm5', name: 'River sand', unit: 'M³', qty: 12, capacity: '66', pct: 18, status: 'Low' },
];

export const documents = [
  { id: 'd1', number: 'BCT-STR-001', title: 'Structural typical floor plan', revision: 'Rev.04', date: '12 Jul 2026', status: 'current' },
  { id: 'd2', number: 'BCT-STR-001', title: 'Structural typical floor plan', revision: 'Rev.03', date: '04 May 2026', status: 'superseded' },
  { id: 'd3', number: 'BCT-ARC-004', title: 'Architectural elevations N/S', revision: 'Rev.02', date: '01 Jun 2026', status: 'current' },
  { id: 'd4', number: 'BCT-MEP-012', title: 'Electrical single line diagram', revision: 'Rev.01', date: '18 Mar 2026', status: 'current' },
  { id: 'd5', number: 'BCT-STR-002', title: 'Foundation layout grid lines', revision: 'Rev.01', date: '10 Jan 2025', status: 'superseded' },
];
