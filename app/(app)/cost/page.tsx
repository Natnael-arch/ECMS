'use client';
import React, { useState } from 'react';
import { costCodes } from '@/lib/data';
import { AlertStrip } from '@/components/ui/AlertStrip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useToast } from '@/components/ui/Toast';

export default function CostPage() {
  const toast = useToast();
  const [costCode, setCostCode] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast('Cost logged successfully', 'success');
    setCostCode('');
    setAmount('');
    setDesc('');
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full">
      <AlertStrip 
        message="2 cost codes exceed 80% of budget — review now" 
        type="error" 
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Cost Codes Cards */}
        <div className="xl:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {costCodes.map(code => {
              const pct = (code.actual / code.budget) * 100;
              const colorClass = pct >= 95 ? 'bg-ecms-danger' : pct >= 80 ? 'bg-ecms-amber' : pct < 20 ? 'bg-ecms-info' : 'bg-ecms-success';
              const textClass = pct >= 95 ? 'text-ecms-danger' : pct >= 80 ? 'text-ecms-amber' : pct < 20 ? 'text-ecms-info' : 'text-ecms-success';
              
              return (
                <div key={code.name} className="bg-ecms-card border border-ecms-border rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-ecms-text">{code.name}</h3>
                    <span className={`font-bold ${textClass}`}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-ecms-text">{code.actual}M ETB</span>
                    <span className="text-ecms-muted">of {code.budget}M ETB</span>
                  </div>
                  <ProgressBar progress={pct} colorClass={colorClass} showLabel={false} className="mt-1" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Log Cost Form */}
        <div className="flex flex-col">
          <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 sticky top-20">
            <h2 className="text-base font-semibold text-ecms-text mb-4">Log New Cost</h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Cost Code</label>
                <select 
                  value={costCode}
                  onChange={(e) => setCostCode(e.target.value)}
                  required
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors appearance-none"
                >
                  <option value="" disabled>Select Cost Code</option>
                  {costCodes.map(c => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Amount (ETB)</label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="e.g. 50000"
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Description</label>
                <textarea 
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  required
                  rows={3}
                  placeholder="Invoice # or details..."
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors resize-none"
                />
              </div>

              <button 
                type="submit" 
                className="mt-2 w-full bg-ecms-amber text-ecms-navy font-bold py-2.5 rounded-lg hover:bg-opacity-90 transition-all"
              >
                Log Cost
              </button>
            </form>
          </div>
        </div>
        
      </div>
    </div>
  );
}
