// PWA Service Worker Registration and Update Controller

export interface PWAState {
  isRegistered: boolean;
  hasUpdate: boolean;
  waitingWorker: ServiceWorker | null;
}

type PWAUpdateListener = (state: PWAState) => void;

class PWAController {
  private state: PWAState = {
    isRegistered: false,
    hasUpdate: false,
    waitingWorker: null,
  };
  private listeners: Set<PWAUpdateListener> = new Set();

  public init() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Only register in production or when service workers are supported
    window.addEventListener('load', () => {
      // Use relative path so it works in both root / and GitHub Pages /TCG/ base
      const swUrl = './sw.js';

      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          this.state.isRegistered = true;
          this.notify();

          // Check if an updated service worker is already waiting
          if (registration.waiting) {
            this.state.hasUpdate = true;
            this.state.waitingWorker = registration.waiting;
            this.notify();
          }

          // Listen for new service worker installation
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;

            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                // New update available!
                this.state.hasUpdate = true;
                this.state.waitingWorker = registration.waiting || installing;
                this.notify();
              }
            });
          });
        })
        .catch((err) => {
          // In some sandbox / iframe environments, service workers may be restricted; fail silently
          console.log('[PWA] Service Worker registration skipped or not supported:', err.message);
        });

      // Handle controller change (reloaded after skipWaiting)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  public subscribe(listener: PWAUpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public applyUpdate() {
    if (this.state.waitingWorker) {
      this.state.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }
}

export const pwaController = new PWAController();
