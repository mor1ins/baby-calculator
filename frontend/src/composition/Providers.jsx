import { QueryClientProvider } from '@tanstack/react-query';
import PropTypes from 'prop-types';

import { BusContext } from '../presentation/BusContext.jsx';

export function Providers({ runtime, children }) {
    return (
        <QueryClientProvider client={runtime.queryClient}>
            <BusContext.Provider value={runtime.bus}>{children}</BusContext.Provider>
        </QueryClientProvider>
    );
}
Providers.propTypes = { runtime: PropTypes.object.isRequired, children: PropTypes.node.isRequired };
