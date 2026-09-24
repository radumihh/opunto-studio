import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/primitives';
import Layout from '@/components/Layout';
import ProjectsPage from '@/pages/ProjectsPage';
import EditorPage from '@/pages/EditorPage';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/LoginPage';
import { auth } from '@/lib/api';
import './index.css';

const router = createBrowserRouter([
    {
        element: <Layout />,
        children: [
            { index: true, element: <Navigate to="/arch" replace /> },
            { path: '/arch', element: <ProjectsPage site="arch" key="arch" /> },
            { path: '/concepts', element: <ProjectsPage site="concepts" key="concepts" /> },
            { path: '/settings', element: <SettingsPage /> }
        ]
    },
    { path: '/p/:id', element: <EditorPage /> },
    { path: '*', element: <Navigate to="/arch" replace /> }
]);

/* the studio opens only once the server says this browser is signed in;
   any 401 later (password changed elsewhere) brings the sign-in back */
function App() {
    const [state, setState] = useState('checking');
    useEffect(() => {
        auth.me().then(m => setState(m.signedIn ? 'in' : 'out')).catch(() => setState('out'));
        const off = () => setState('out');
        addEventListener('opunto:signed-out', off);
        return () => removeEventListener('opunto:signed-out', off);
    }, []);
    if (state === 'checking') return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    if (state === 'out') return <LoginPage onIn={() => setState('in')} />;
    return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <TooltipProvider>
            <App />
            <Toaster position="bottom-center" toastOptions={{ className: '!rounded-xl !text-[13px] !shadow-lg' }} />
        </TooltipProvider>
    </React.StrictMode>
);
