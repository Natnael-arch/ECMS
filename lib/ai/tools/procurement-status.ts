import { db as defaultDb } from '@/lib/db';
import { checkToolPermissions } from './utils';

export const schema = {
  name: 'get_procurement_status',
  description:
    'Get status of open purchase requisitions and purchase orders, plus stock levels for top N materials by value from the stock ledger.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The UUID of the project' },
      topN: { type: 'number', description: 'Number of top materials by stock value to return (default 5)' },
    },
    required: ['projectId'],
  },
};

export async function run(
  projectId: string,
  userId: string,
  args: { projectId?: string; topN?: number } = {},
  dbClient: any = defaultDb
) {
  const targetProjectId = projectId || args.projectId;
  const topN = args.topN || 5;

  const permCheck = await checkToolPermissions(targetProjectId, userId, 'inventory.read', dbClient);
  if (!permCheck.allowed) {
    return permCheck;
  }

  // Open Requisitions
  const requisitions = await dbClient.purchase_requisitions.findMany({
    where: { project_id: targetProjectId },
    orderBy: { created_at: 'desc' },
  });

  const requisitionCountsByStatus: Record<string, number> = {};
  for (const pr of requisitions) {
    requisitionCountsByStatus[pr.status] = (requisitionCountsByStatus[pr.status] || 0) + 1;
  }

  const openRequisitions = requisitions
    .filter((pr: any) => !['cancelled', 'rejected', 'fulfilled'].includes(pr.status))
    .slice(0, 10)
    .map((pr: any) => ({
      id: pr.id,
      requisitionNumber: pr.requisition_number,
      status: pr.status,
      title: pr.title || pr.description,
      createdAt: pr.created_at,
    }));

  // Open Purchase Orders
  const purchaseOrders = await dbClient.purchase_orders.findMany({
    where: { project_id: targetProjectId },
    orderBy: { created_at: 'desc' },
  });

  const poCountsByStatus: Record<string, number> = {};
  for (const po of purchaseOrders) {
    poCountsByStatus[po.status] = (poCountsByStatus[po.status] || 0) + 1;
  }

  const openPurchaseOrders = purchaseOrders
    .filter((po: any) => !['cancelled', 'closed', 'fully_received'].includes(po.status))
    .slice(0, 10)
    .map((po: any) => ({
      id: po.id,
      poNumber: po.po_number,
      status: po.status,
      totalAmount: Number(po.total_amount || 0),
      currency: po.currency || 'ETB',
      createdAt: po.created_at,
    }));

  // Stock Ledger Top N Materials
  const stockEntries = await dbClient.stock_ledger_entries.findMany({
    where: { project_id: targetProjectId },
    include: {
      inventory_items: true,
    },
  });

  const stockMap = new Map<
    string,
    { id: string; code: string; name: string; unit: string; totalQuantity: number; totalValue: number }
  >();

  for (const entry of stockEntries) {
    const item = entry.inventory_items;
    const itemId = entry.inventory_item_id;

    if (!stockMap.has(itemId)) {
      stockMap.set(itemId, {
        id: itemId,
        code: item?.item_code || 'N/A',
        name: item?.name || 'Unknown Item',
        unit: item?.unit || 'pcs',
        totalQuantity: 0,
        totalValue: 0,
      });
    }

    const rec = stockMap.get(itemId)!;
    rec.totalQuantity += Number(entry.quantity_delta || 0);
    rec.totalValue += Number(entry.value_delta || 0);
  }

  const topMaterials = Array.from(stockMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, topN)
    .map((mat) => ({
      ...mat,
      totalQuantity: Math.round((mat.totalQuantity + Number.EPSILON) * 100) / 100,
      totalValue: Math.round((mat.totalValue + Number.EPSILON) * 100) / 100,
    }));

  return {
    projectId: targetProjectId,
    requisitionsSummary: {
      totalCount: requisitions.length,
      countsByStatus: requisitionCountsByStatus,
      openRequisitions,
    },
    purchaseOrdersSummary: {
      totalCount: purchaseOrders.length,
      countsByStatus: poCountsByStatus,
      openPurchaseOrders,
    },
    topMaterialsByValue: topMaterials,
  };
}
