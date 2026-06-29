import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DrawingEngine } from '../engine/DrawingEngine';
import type { EngineState } from '../types';

/** Context carrying the singleton DrawingEngine instance. */
export const EngineContext = createContext<DrawingEngine | null>(null);

/** Access the engine instance (throws if used outside the provider). */
export function useEngine(): DrawingEngine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error('useEngine must be used within EngineContext.Provider');
  return engine;
}

/**
 * Subscribe to the engine's immutable state snapshot. Components re-render only
 * when the snapshot reference changes (i.e. on metadata changes, never on raw
 * pixel mutations), keeping drawing fast.
 */
export function useEngineState(): EngineState {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
