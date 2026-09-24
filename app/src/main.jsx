import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/primitives';
import Layout from '@/components/Layout';
import ProjectsPage from '@/pages/ProjectsPage';
import EditorPage from '@/pages/EditorPage';
import SettingsPage from '@/pages/SettingsPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <TooltipProvider>
            <BrowserRouter>
                <Routes>
                    <Route element={<Layout />}>
                        <Route index element={<Navigate to="/arch" replace />} />
                        <Route path="/arch" element={<ProjectsPage site="arch" />} />
                        <Route path="/concepts" element={<ProjectsPage site="concepts" />} />
                        <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                    <Route path="/p/:id" element={<EditorPage />} />
                    <Route path="*" element={<Navigate to="/arch" replace />} />
                </Routes>
            </BrowserRouter>
            <Toaster position="bottom-center" toastOptions={{ className: '!rounded-xl !text-[13px] !shadow-lg' }} />
        </TooltipProvider>
    </React.StrictMode>
);
