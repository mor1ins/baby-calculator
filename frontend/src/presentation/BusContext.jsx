import { createContext, useContext } from 'react';

export const BusContext = createContext(null);

export function useBus() {
    const bus = useContext(BusContext);
    if (!bus) throw new Error('Message bus is not provided');
    return bus;
}
