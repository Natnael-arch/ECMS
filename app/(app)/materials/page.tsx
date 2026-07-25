'use client';
import React, { useState } from 'react';
import { materials } from '@/lib/data';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useToast } from '@/components/ui/Toast';
import { IconBox, IconAlertCircle } from '@tabler/icons-react';

export default function MaterialsPage() {
  const toast = useToast();
  const [material, setMaterial] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast('Material request submitted to storekeeper', 'success');
    setMaterial('');
    setQty('');
    setReason('');
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:w-2/3">
        <KpiCard 
          title="Total Items" 
          value="18" 
          icon={<IconBox size={24} />} 
        />
        <KpiCard 
          title="Low Stock Alerts" 
          value="3" 
          icon={<IconAlertCircle size={24} />} 
          className="border-ecms-danger/50"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Stock List Table */}
        <div className="xl:col-span-2 bg-ecms-card border border-ecms-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-ecms-border">
            <h2 className="text-base font-semibold text-ecms-text">Site Inventory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ecms-text">
              <thead className="bg-ecms-elevated/50 text-ecms-muted text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Material</th>
                  <th className="px-5 py-3 font-medium text-right">Quantity</th>
                  <th className="px-5 py-3 font-medium w-1/3">Stock Level</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ecms-border">
                {materials.map(m => (
                  <tr key={m.id} className="hover:bg-ecms-elevated/30 transition-colors">
                    <td className="px-5 py-4 font-medium">{m.name}</td>
                    <td className="px-5 py-4 text-right">{m.qty} <span className="text-ecms-muted">{m.unit}</span></td>
                    <td className="px-5 py-4">
                      <ProgressBar 
                        progress={m.pct} 
                        showLabel={false}
                        colorClass={m.status === 'Low' ? 'bg-ecms-danger' : m.status === 'Medium' ? 'bg-ecms-amber' : 'bg-ecms-success'}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Material Request Form */}
        <div className="flex flex-col">
          <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 sticky top-20">
            <h2 className="text-base font-semibold text-ecms-text mb-4">Request Material</h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Material</label>
                <select 
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  required
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors appearance-none"
                >
                  <option value="" disabled>Select Material</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Quantity Required</label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                  placeholder="e.g. 10"
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Reason for Request</label>
                <textarea 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  placeholder="e.g. Block work on 3rd floor"
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors resize-none"
                />
              </div>

              <button 
                type="submit" 
                className="mt-2 w-full bg-ecms-amber text-ecms-navy font-bold py-2.5 rounded-lg hover:bg-opacity-90 transition-all"
              >
                Submit request to storekeeper
              </button>
            </form>
          </div>
        </div>
        
      </div>
    </div>
  );
}
