import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import useReducedMotion from './useReducedMotion';

// The brand mark comes alive only in welcome and empty states.
export default function Mascot({
  small = false,
  still = false,
}: {
  small?: boolean;
  still?: boolean;
}) {
  const reduced = useReducedMotion() || still;
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [hello, setHello] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    if (!hello) return;
    const timer = setTimeout(() => setHello(false), 1200);
    return () => clearTimeout(timer);
  }, [hello]);
  return (
    <button
      className={`mascot ${small ? 'small' : ''}`}
      aria-label="Say hello to Glim"
      title="Say hello"
      onClick={() => setHello(true)}
      onPointerMove={(e) => {
        if (reduced) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        setLook({
          x: Math.max(-1.5, Math.min(1.5, (e.clientX - bounds.left - bounds.width / 2) / 25)),
          y: Math.max(-1, Math.min(1, (e.clientY - bounds.top - bounds.height / 2) / 30)),
        });
      }}
      onPointerLeave={() => setLook({ x: 0, y: 0 })}
    >
      <motion.svg
        viewBox="0 0 48 32"
        aria-hidden="true"
        animate={{ rotate: hello && !reduced ? -6 : 0, y: hello && !reduced ? -2 : 0 }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
      >
        <path fill="currentColor" d="M4 6H44V13C44 22.2 37.4 27 24 27S4 22.2 4 13V6Z" />
        <motion.g
          animate={{ x: look.x, y: look.y }}
          transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
        >
          <motion.g
            style={{ transformOrigin: '24px 15px' }}
            animate={{ scaleY: hello ? 0.2 : !reduced && visible ? [1, 1, 0.08, 1] : 1 }}
            transition={
              hello || reduced || !visible
                ? { duration: 0.12 }
                : { duration: 0.24, times: [0, 0.3, 0.5, 1], repeat: Infinity, repeatDelay: 6 }
            }
          >
            <circle cx="18" cy="15" r="2" fill="#141416" />
            <circle cx="30" cy="15" r="2" fill="#141416" />
          </motion.g>
        </motion.g>
      </motion.svg>
      <span className="mascot-greeting" aria-live="polite">
        {hello ? 'Hello.' : ''}
      </span>
    </button>
  );
}
