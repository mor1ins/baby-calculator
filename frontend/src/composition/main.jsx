import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from '../presentation/App.jsx';
import { createRuntime } from './container.js';
import { Providers } from './Providers.jsx';

const runtime = createRuntime();
const stopTheme = await runtime.startTheme(document.documentElement);
if (import.meta.hot) import.meta.hot.dispose(stopTheme);
createRoot(document.getElementById('root')).render(
    <StrictMode>
        <Providers runtime={runtime}>
            <BrowserRouter>
                <App registrationEnabled={globalThis.__BABY_CONFIG__?.registrationEnabled === true} />
            </BrowserRouter>
        </Providers>
    </StrictMode>,
);
