import { createContext } from 'react';

import type { Window } from '../shared/types';

/** Provided by App: narrows every tab to a window dragged on any chart. */
export const ZoomContext = createContext<((w: Window) => void) | null>(null);
