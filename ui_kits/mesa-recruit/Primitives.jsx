// MESA Recruit · Shared primitives
// Card, Button, Input, StatusPill, AiBadge, MatchRing, Avatar, Widget, Tag, Modal
// Style refs: MESA/src/components/card/index.jsx, fields/InputField.jsx, progress/index.jsx

const { useState, useEffect, useRef } = React;

// === Card ===========================================================
function Card({ children, className = '', extra = '', as: As = 'div', ...rest }) {
  return (
    <As
      className={`!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-[14px_17px_40px_4px_rgba(112,144,176,0.08)] ${className} ${extra}`}
      {...rest}
    >
      {children}
    </As>
  );
}

// === Button =========================================================
function Button({ children, variant = 'primary', size = 'md', icon, className = '', as: As = 'button', ...rest }) {
  const sizes = {
    sm: 'h-9 px-4 text-sm rounded-xl gap-1.5',
    md: 'h-11 px-5 text-sm rounded-xl gap-2',
    lg: 'h-12 px-6 text-base rounded-xl gap-2',
  };
  const variants = {
    primary:
      'bg-[#422AFB] text-white hover:bg-[#3311DB] active:bg-[#2111A5] font-medium shadow-[0_4px_14px_rgba(66,42,251,0.18)]',
    secondary:
      'bg-[#F4F7FE] text-[#1B254B] hover:bg-[#E9ECEF] font-medium',
    ghost:
      'bg-transparent text-[#1B254B] hover:bg-[#F4F7FE] border border-[#E9ECEF] font-medium',
    danger:
      'bg-[#F53939] text-white hover:bg-[#EA0606] active:bg-[#B91C1C] font-medium',
    pill:
      'bg-[#422AFB] text-white hover:bg-[#3311DB] font-medium rounded-full',
  };
  return (
    <As
      className={`inline-flex items-center justify-center transition-colors duration-200 ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon && <span className="inline-flex" style={{ lineHeight: 0 }}>{icon}</span>}
      {children}
    </As>
  );
}

// === Input ==========================================================
function Input({ label, id, type = 'text', placeholder, state, disabled, variant, icon, value, onChange, className = '', ...rest }) {
  const stateCls =
    disabled
      ? '!border-none !bg-gray-100'
      : state === 'error'
      ? 'border-red-500 text-red-500 placeholder:text-red-500'
      : state === 'success'
      ? 'border-green-500 text-green-500'
      : 'border-[#E9ECEF] text-[#1B254B]';
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className={`text-sm text-[#1B254B] ${variant === 'auth' ? 'ml-1.5 font-medium' : 'ml-3 font-bold'} block mb-2`}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0AEC0]">{icon}</span>
        )}
        <input
          disabled={disabled}
          type={type}
          id={id}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`flex h-12 w-full items-center rounded-xl border bg-white/0 p-3 text-sm outline-none placeholder:text-[#A0AEC0] focus:border-[#422AFB] transition-colors ${icon ? 'pl-10' : ''} ${stateCls}`}
          {...rest}
        />
      </div>
    </div>
  );
}

// === Status Pill ====================================================
function StatusPill({ status, size = 'sm' }) {
  const tone = window.MESA_STATUS_TONE[status] || window.MESA_STATUS_TONE['待筛选'];
  const sz = size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap ${sz}`}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }}></span>
      {status}
    </span>
  );
}

// === AI Badge =======================================================
function AiBadge({ parser = 'Kimi', confidence }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
      style={{ background: 'linear-gradient(135deg,#868CFF 0%,#432CF3 50%,#422AFB 100%)' }}
    >
      <I name="sparkles" size={11} strokeWidth={2.5} />
      {parser} 已解析
      {confidence != null && <span className="opacity-80 font-medium">· {confidence}%</span>}
    </span>
  );
}

// === Match Ring =====================================================
function MatchRing({ value = 0, size = 56, stroke = 6, showLabel = true, animate = true }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color =
    value >= 90 ? '#22C55E' : value >= 70 ? '#422AFB' : value >= 50 ? '#F59E0B' : '#F53939';

  // Animate stroke fill on mount
  const [progress, setProgress] = useState(animate ? 0 : value);
  // Animate displayed number with rAF tween
  const [num, setNum] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) { setProgress(value); setNum(value); return; }
    // Defer one paint so the transition runs
    const trigger = requestAnimationFrame(() => requestAnimationFrame(() => setProgress(value)));

    let raf, start;
    const duration = 1100;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const step = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setNum(Math.round(value * easeOut(t)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => { cancelAnimationFrame(trigger); cancelAnimationFrame(raf); };
  }, [value, animate]);

  const dash = c * (progress / 100);
  return (
    <div className="relative inline-flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EDF2F7" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - dash}
          style={{ transition: animate ? 'stroke-dashoffset 1100ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-bold text-[#1B254B] leading-none tabular-nums" style={{ fontSize: size * 0.32 }}>{num}</div>
        {showLabel && size >= 80 && <div className="text-[10px] text-[#A3AED0] font-medium mt-1">JD 匹配</div>}
      </div>
    </div>
  );
}

// === Animal avatar ==================================================
// Default candidate avatars are little animals (colored bg + Lucide icon).
// Admins can override with a photo upload — see CandidateDetail.

const ANIMAL_PRESETS = {
  cat:      { icon: 'cat',      bg: '#FED7AA', fg: '#9A3412', label: '小橘猫' },
  dog:      { icon: 'dog',      bg: '#FCD34D', fg: '#854D0E', label: '小黄狗' },
  rabbit:   { icon: 'rabbit',   bg: '#F4F7FE', fg: '#707EAE', label: '小白兔' },
  bird:     { icon: 'bird',     bg: '#A5F3FC', fg: '#155E75', label: '小蓝鸟' },
  fish:     { icon: 'fish',     bg: '#BFDBFE', fg: '#1D4ED8', label: '小蓝鱼' },
  squirrel: { icon: 'squirrel', bg: '#FED7AA', fg: '#7C2D12', label: '小松鼠' },
  turtle:   { icon: 'turtle',   bg: '#BBF7D0', fg: '#15803D', label: '小乌龟' },
  snail:    { icon: 'snail',    bg: '#FBCFE8', fg: '#9D174D', label: '小蜗牛' },
  bug:      { icon: 'bug',      bg: '#FECACA', fg: '#B91C1C', label: '小瓢虫' },
  rat:      { icon: 'rat',      bg: '#E9E3FF', fg: '#422AFB', label: '小老鼠' },
  worm:     { icon: 'worm',     bg: '#D9F99D', fg: '#4D7C0F', label: '小毛虫' },
  panda:    { icon: 'panda',    bg: '#1B254B', fg: '#FFFFFF', label: '小熊猫' },
};
window.MESA_ANIMAL_PRESETS = ANIMAL_PRESETS;

function AnimalAvatar({ animal = 'cat', size = 40 }) {
  const preset = ANIMAL_PRESETS[animal] || ANIMAL_PRESETS.cat;
  // panda isn't a Lucide icon — fall back to 'rabbit' as a shape, recolored
  const iconName = preset.icon === 'panda' ? 'rabbit' : preset.icon;
  const iconSize = Math.round(size * 0.6);
  return (
    <span
      className="rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: preset.bg, color: preset.fg }}
    >
      <I name={iconName} size={iconSize} strokeWidth={2.2} />
    </span>
  );
}

// === Avatar =========================================================
// Supports either a photo (src) or an animal preset. Defaults to animal.
function Avatar({ src, name, size = 40, ring = false, gender, animal }) {
  const ringCls = ring ? 'ring-2 ring-white shadow-md' : '';
  const body = src
    ? <img src={src} alt={name} className={`rounded-full object-cover w-full h-full ${ringCls}`} />
    : <span className={`block w-full h-full rounded-full ${ringCls}`}><AnimalAvatar animal={animal} size={size} /></span>;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {body}
      {gender && <GenderBadge gender={gender} size={size} />}
    </span>
  );
}

function GenderBadge({ gender, size = 40 }) {
  const tones = {
    male:    { bg: '#3B82F6', glyph: '♂' },
    female:  { bg: '#DB2777', glyph: '♀' },
    unknown: { bg: '#A3AED0', glyph: '?' },
  };
  const t = tones[gender] || tones.unknown;
  // badge scales with avatar; ~38–40% of width, min 14px
  const bs = Math.max(14, Math.round(size * 0.38));
  const fs = Math.max(9, Math.round(bs * 0.62));
  return (
    <span
      className="absolute bottom-0 right-0 inline-flex items-center justify-center rounded-full text-white font-bold leading-none"
      style={{
        width: bs, height: bs, fontSize: fs, background: t.bg,
        boxShadow: '0 0 0 2px white',
      }}
      title={gender === 'male' ? '男' : gender === 'female' ? '女' : '未知'}
    >
      {t.glyph}
    </span>
  );
}

function AvatarStack({ candidates = [], max = 4, size = 28 }) {
  const visible = candidates.slice(0, max);
  const extra = candidates.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((c, i) => (
        <span
          key={c.id}
          className="rounded-full ring-2 ring-white inline-block"
          style={{ width: size, height: size, marginLeft: i ? -size * 0.4 : 0 }}
        >
          {c.avatar
            ? <img src={c.avatar} alt={c.name} className="w-full h-full rounded-full object-cover" />
            : <AnimalAvatar animal={c.animal} size={size} />}
        </span>
      ))}
      {extra > 0 && (
        <div
          className="rounded-full ring-2 ring-white bg-[#F4F7FE] text-[#1B254B] flex items-center justify-center text-[10px] font-bold"
          style={{ width: size, height: size, marginLeft: -size * 0.4 }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

// === Widget =========================================================
function useCountUp(target, duration = 1100) {
  // Parse a numeric target out of strings like "2,148" or "412" or 38.
  const parsed = typeof target === 'number'
    ? target
    : parseFloat(String(target).replace(/,/g, '')) || 0;
  const hasComma = typeof target === 'string' && target.includes(',');
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const step = (ts) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setV(parsed * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [parsed, duration]);
  const rounded = Math.round(v);
  return hasComma ? rounded.toLocaleString('en-US') : String(rounded);
}

function Widget({ icon, title, value, trend }) {
  const display = useCountUp(value);
  return (
    <Card extra="!flex-row items-center px-5 py-5">
      <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#F4F7FE] text-[#422AFB] shrink-0">
        {icon}
      </div>
      <div className="ml-4 flex flex-col justify-center min-w-0">
        <p className="text-[13px] font-medium text-[#A3AED0]">{title}</p>
        <h4 className="text-[22px] font-bold text-[#1B254B] tracking-tight tabular-nums">{display}</h4>
        {trend && (
          <p className={`text-[11px] font-bold mt-0.5 ${trend.startsWith('+') ? 'text-[#15803D]' : 'text-[#B91C1C]'}`}>
            {trend}
          </p>
        )}
      </div>
    </Card>
  );
}

// === Tag ============================================================
function Tag({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-[#F4F7FE] text-[#1B254B]',
    brand:   'bg-[#E9E3FF] text-[#2111A5] font-bold',
    green:   'bg-[#DCFCE7] text-[#15803D]',
    amber:   'bg-[#FEF3C7] text-[#92400E]',
    red:     'bg-[#FEE2E2] text-[#B91C1C]',
    outline: 'bg-transparent text-[#707EAE] border border-[#E9ECEF]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

// === Modal ==========================================================
function Modal({ open, onClose, children, width = 720 }) {
  useEffect(() => {
    function onEsc(e) { if (e.key === 'Escape') onClose && onClose(); }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-[20px] shadow-[0_30px_60px_rgba(112,144,176,0.20)] overflow-hidden max-h-[90vh] flex flex-col"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// === Icon helper ===================================================
function I({ name, size = 18, strokeWidth = 2, className = '' }) {
  // Re-creates icons each render so they appear after React mounts
  const ref = useRef(null);
  useEffect(() => {
    if (window.lucide && ref.current) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.strokeWidth = strokeWidth;
      ref.current.appendChild(el);
      if (window.__refreshLucideIcons) {
        window.__refreshLucideIcons();
      } else {
        window.lucide.createIcons({ nameAttr: 'data-lucide' });
      }
    }
  }, [name, size, strokeWidth]);
  return <span ref={ref} className={`inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }} />;
}

Object.assign(window, { Card, Button, Input, StatusPill, AiBadge, MatchRing, Avatar, AnimalAvatar, GenderBadge, AvatarStack, Widget, Tag, Modal, I });
