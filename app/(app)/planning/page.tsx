'use client';
import React, { useState } from 'react';
import { GanttChart } from '@/components/charts/GanttChart';
import { SCurve } from '@/components/charts/SCurve';
import { AlertStrip } from '@/components/ui/AlertStrip';
import { useToast } from '@/components/ui/Toast';
import { ganttActivities } from '@/lib/data';

export default function PlanningPage() {
  const toast = useToast();
  
  const [activity, setActivity] = useState('');
  const [progress, setProgress] = useState('');
  const [workers, setWorkers] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast('Daily progress saved successfully', 'success');
    setActivity('');
    setProgress('');
    setWorkers('');
    setNotes('');
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full">
      <AlertStrip 
        message="Superstructure is 4% behind baseline" 
        type="warning" 
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Main Planning Area */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="w-full overflow-hidden rounded-xl">
            <h2 className="text-base font-semibold text-ecms-text mb-4">Project Schedule (Bole Tower)</h2>
            <GanttChart />
          </div>
          
          <div className="w-full">
            <SCurve />
          </div>
        </div>

        {/* Daily Progress Form */}
        <div className="flex flex-col">
          <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 sticky top-20">
            <h2 className="text-base font-semibold text-ecms-text mb-4">Log Daily Progress</h2>
            
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Activity</label>
                <select 
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  required
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors appearance-none"
                >
                  <option value="" disabled>Select Activity</option>
                  {ganttActivities.filter(a => a.progress < 100).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col gap-1.5 w-1/2">
                  <label className="text-sm text-ecms-muted font-medium">% Complete</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="100"
                    value={progress}
                    onChange={(e) => setProgress(e.target.value)}
                    required
                    placeholder="e.g. 45"
                    className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5 w-1/2">
                  <label className="text-sm text-ecms-muted font-medium">Workers</label>
                  <input 
                    type="number" 
                    min="0"
                    value={workers}
                    onChange={(e) => setWorkers(e.target.value)}
                    required
                    placeholder="e.g. 12"
                    className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ecms-muted font-medium">Notes</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any delays or issues?"
                  className="bg-ecms-elevated border border-ecms-border-strong rounded-lg px-4 py-2 text-sm text-ecms-text focus:outline-none focus:border-ecms-amber transition-colors resize-none"
                />
              </div>

              <button 
                type="submit" 
                className="mt-2 w-full bg-ecms-amber text-ecms-navy font-bold py-2.5 rounded-lg hover:bg-opacity-90 transition-all"
              >
                Submit progress report
              </button>
            </form>
          </div>
        </div>
        
      </div>
    </div>
  );
}
