import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

interface PairingInfo {
  code: string;
  pairUrl: string;
  qrCode: string;
  expiresAt: string;
}

interface PairingModalProps {
  roomId: string;
  onClose: () => void;
  onPaired: () => void;
}

const POLL_INTERVAL_MS = 3000;

export function PairingModal({ roomId, onClose, onPaired }: PairingModalProps) {
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paired, setPaired] = useState(false);
  const onPairedRef = useRef(onPaired);
  useEffect(() => {
    onPairedRef.current = onPaired;
  }, [onPaired]);

  const generate = useCallback(async () => {
    setError(null);
    setPairing(null);
    try {
      const response = await api.generatePairingCode(roomId);
      setPairing(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code');
    }
  }, [roomId]);

  useEffect(() => {
    generate();
  }, [generate]);

  // Countdown to code expiry
  useEffect(() => {
    if (!pairing) return;
    const expiresAt = new Date(pairing.expiresAt).getTime();
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pairing]);

  // Poll until the phone redeems the code
  useEffect(() => {
    if (!pairing || paired) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.getPairingStatus(pairing.code);
        if (status.used) {
          setPaired(true);
          onPairedRef.current();
        }
      } catch {
        // Transient polling errors are fine; the countdown still governs expiry
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pairing, paired]);

  const expired = pairing !== null && secondsLeft === 0 && !paired;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pairing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pairing-modal-header">
          <h3>Add a camera</h3>
          <button className="modal-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        {paired ? (
          <div className="pairing-success">
            <span className="pairing-success-icon">✅</span>
            <p>Camera paired! It will appear in the grid in a moment.</p>
            <button className="pairing-action-btn" onClick={onClose}>
              Done
            </button>
          </div>
        ) : error ? (
          <div className="pairing-modal-error">
            <p>{error}</p>
            <button className="pairing-action-btn" onClick={generate}>
              Try again
            </button>
          </div>
        ) : !pairing ? (
          <div className="loading">Generating code…</div>
        ) : (
          <>
            <ol className="pairing-steps">
              <li>Grab a spare phone (an old one works great)</li>
              <li>Scan this QR code with its camera app</li>
              <li>Allow camera and microphone access — that's it</li>
            </ol>

            <div className="pairing-qr-wrap">
              {expired ? (
                <div className="pairing-expired">
                  <p>Code expired</p>
                  <button className="pairing-action-btn" onClick={generate}>
                    Generate new code
                  </button>
                </div>
              ) : (
                <img className="pairing-qr" src={pairing.qrCode} alt="Pairing QR code" />
              )}
            </div>

            {!expired && (
              <>
                <p className="pairing-manual">
                  No QR scanner? Open <strong>{pairing.pairUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</strong> on
                  the phone and enter code <strong className="pairing-code">{pairing.code}</strong>
                </p>
                <p className="pairing-countdown">
                  Code expires in {minutes}:{seconds}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
