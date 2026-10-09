import { type CSSProperties, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ClientConfigContext } from "../state/config";

const MAX_STAMINA = 5;
const FLEE_RADIUS = 120;
const CATCH_RADIUS = 48;
const PET_SIZE = 132;

const CRUISE_SPEED = 82; // 闲逛巡航速度 px/s
const IDLE_LINES = [
    "吱吱～",
    "藏了颗松果",
    "今天天气真好",
    "哔——",
    "要不要一起蹦跶",
    "松果给你留了一颗",
];

const FLEE_LINES = ["吱！抓不到！", "身手不错嘛！", "树呢？我的树呢", "再快一点！"];
const TIRED_LINES = ["呼…腿短跑不动了", "让我抱颗松果歇歇", "心跳好快…"];
const CAUGHT_LINES = ["被抓到啦！", "酷是酷不起来了…", "愿赌服输，松果分你", "下次躲树洞里！"];

const CATCH_MILESTONES: Record<number, string> = {
    5: "抓到我5次啦，我们是好朋友了！",
    20: "20次！你是我宿命之敌！",
    50: "50次…我认输，松果都归你",
};

const PARTICLE_COLORS = ["#f59e0b", "#f43f5e", "#38bdf8", "#a78bfa", "#34d399", "#d4915c"];

type Mode = "wander" | "flee" | "tired" | "caught";
type Particle = {
    id: number;
    dx: number;
    dy: number;
    rot: number;
    delay: number;
    kind: "dot" | "heart" | "star";
    color: string;
    size: number;
};

function bounds() {
    const margin = 16;
    return {
        minX: margin,
        minY: 130,
        maxX: Math.max(margin, window.innerWidth - PET_SIZE - margin),
        maxY: Math.max(130, window.innerHeight - PET_SIZE - margin),
    };
}

function randomWanderPoint() {
    const b = bounds();
    return {
        x: b.minX + Math.random() * (b.maxX - b.minX),
        y: b.minY + Math.random() * (b.maxY - b.minY),
    };
}

export function SitePet() {
    const config = useContext(ClientConfigContext);
    const wrapRef = useRef<HTMLDivElement>(null);
    const visualRef = useRef<HTMLDivElement>(null);
    const pupilRef = useRef<SVGGElement>(null);
    const headRef = useRef<SVGGElement>(null);
    const rafMoveRef = useRef<number | null>(null);
    const rafPointerRef = useRef<number | null>(null);
    const modeRef = useRef<Mode>("wander");
    const staminaRef = useRef(MAX_STAMINA);
    const fleeCountRef = useRef(0);
    const nextFleeAllowedRef = useRef(0);
    const physicsRef = useRef({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        targetX: 0,
        targetY: 0,
        retargetAt: 0,
        idleUntil: 0,
        hopPhase: 0,
    });
    const bubbleTimerRef = useRef<number | undefined>(undefined);
    const modeTimerRef = useRef<number | undefined>(undefined);
    const tiredTimerRef = useRef<number | undefined>(undefined);
    const catchTimerRef = useRef<number | undefined>(undefined);
    const catchesRef = useRef(Number(localStorage.getItem("rin-pet-caught")) || 0);

    const [mode, setMode] = useState<Mode>("wander");
    const [bubble, setBubble] = useState<string | null>(null);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [hidden, setHidden] = useState(() => localStorage.getItem("rin-pet-hidden") === "1");
    const [catches, setCatches] = useState(catchesRef.current);

    const disabled = config.get<boolean>("pet.enabled") === false;

    const setModeBoth = useCallback((next: Mode) => {
        modeRef.current = next;
        setMode(next);
    }, []);

    const showBubble = useCallback((text: string, ms: number) => {
        window.clearTimeout(bubbleTimerRef.current);
        setBubble(text);
        bubbleTimerRef.current = window.setTimeout(() => setBubble(null), ms);
    }, []);

    // 运动引擎：单个 rAF 循环，物理驱动（位置 + 蹦跳 + 倾斜），直接写 DOM
    useEffect(() => {
        if (disabled || hidden) return;
        const physics = physicsRef.current;
        if (!physics.x && !physics.y) {
            const start = randomWanderPoint();
            physics.x = start.x;
            physics.y = start.y;
            physics.targetX = start.x;
            physics.targetY = start.y;
        }
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let last = performance.now();

        const step = (now: number) => {
            rafMoveRef.current = requestAnimationFrame(step);
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (document.hidden) return;
            const el = wrapRef.current;
            const visualEl = visualRef.current;
            if (!el) return;

            const m = modeRef.current;
            const b = bounds();

            if (m === "wander" || m === "flee") {
                const dx = physics.targetX - physics.x;
                const dy = physics.targetY - physics.y;
                const dist = Math.hypot(dx, dy);
                let steerX = 0;
                let steerY = 0;
                if (m === "wander" && now > physics.idleUntil && dist > 14) {
                    steerX = (dx / dist) * CRUISE_SPEED;
                    steerY = (dy / dist) * CRUISE_SPEED;
                }
                const blend = 1 - Math.exp(-dt * 2.6);
                physics.vx += (steerX - physics.vx) * blend;
                physics.vy += (steerY - physics.vy) * blend;
                const decay = Math.exp(-dt * 3.4);
                if (m === "flee") {
                    physics.vx *= decay;
                    physics.vy *= decay;
                }

                physics.x += physics.vx * dt;
                physics.y += physics.vy * dt;

                if (m === "wander" && dist < 18 && now > physics.retargetAt) {
                    physics.idleUntil = now + 500 + Math.random() * 1600;
                    physics.retargetAt = physics.idleUntil + 300;
                }
                if (m === "wander" && now > physics.retargetAt && dist < 30) {
                    const next = randomWanderPoint();
                    physics.targetX = next.x;
                    physics.targetY = next.y;
                }

                if (physics.x < b.minX) {
                    physics.x = b.minX;
                    physics.vx = Math.abs(physics.vx) * 0.5;
                }
                if (physics.x > b.maxX) {
                    physics.x = b.maxX;
                    physics.vx = -Math.abs(physics.vx) * 0.5;
                }
                if (physics.y < b.minY) {
                    physics.y = b.minY;
                    physics.vy = Math.abs(physics.vy) * 0.5;
                }
                if (physics.y > b.maxY) {
                    physics.y = b.maxY;
                    physics.vy = -Math.abs(physics.vy) * 0.5;
                }
            } else {
                physics.vx = 0;
                physics.vy = 0;
            }

            el.style.transform = `translate3d(${physics.x.toFixed(2)}px, ${physics.y.toFixed(2)}px, 0)`;

            // 视觉层：呼吸 + 蹦跳（速度越快跳得越高越快）+ 冲刺倾斜
            if (visualEl) {
                const speed = Math.hypot(physics.vx, physics.vy);
                physics.hopPhase += dt * (3 + speed * 0.055);
                const breath = reduced ? 0 : Math.sin(now / 540) * 2;
                const hop = reduced ? 0 : Math.abs(Math.sin(physics.hopPhase)) * Math.min(13, speed * 0.016);
                const lean = reduced ? 0 : Math.max(-13, Math.min(13, physics.vx * 0.016));
                visualEl.style.transform = `translateY(${(-breath - hop).toFixed(2)}px) rotate(${lean.toFixed(2)}deg)`;
            }
        };

        rafMoveRef.current = requestAnimationFrame(step);
        return () => {
            if (rafMoveRef.current !== null) cancelAnimationFrame(rafMoveRef.current);
        };
    }, [disabled, hidden]);

    // 闲时自言自语
    useEffect(() => {
        if (disabled || hidden) return;
        let timer: number | undefined;
        const schedule = () => {
            timer = window.setTimeout(() => {
                if (!document.hidden && modeRef.current === "wander") {
                    showBubble(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 3600);
                }
                schedule();
            }, 22000 + Math.random() * 20000);
        };
        schedule();
        return () => window.clearTimeout(timer);
    }, [disabled, hidden, showBubble]);

    // 指针交互：脑袋歪向鼠标 + 眼珠跟随（命令式）+ 逃跑/抓捕判定
    useEffect(() => {
        if (disabled || hidden) return;
        const onMove = (event: PointerEvent) => {
            if (rafPointerRef.current !== null) return;
            const { clientX, clientY } = event;
            rafPointerRef.current = requestAnimationFrame(() => {
                rafPointerRef.current = null;
                const el = wrapRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = clientX - cx;
                const dy = clientY - cy;
                const distance = Math.hypot(dx, dy) || 1;

                const pupilEl = pupilRef.current;
                if (pupilEl) {
                    const reach = Math.min(1, distance / 240);
                    const px = (dx / distance) * 3 * reach;
                    const py = (dy / distance) * 2.4 * reach;
                    pupilEl.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
                }

                const headEl = headRef.current;
                if (headEl && modeRef.current !== "caught") {
                    const tilt = Math.max(-7, Math.min(7, dx * 0.012));
                    headEl.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
                }

                const now = performance.now();
                if (modeRef.current === "caught" || modeRef.current === "tired") {
                    if (distance < CATCH_RADIUS) triggerCatch();
                    return;
                }
                if (distance < FLEE_RADIUS && modeRef.current === "wander" && staminaRef.current > 0) {
                    if (now < nextFleeAllowedRef.current) return;
                    triggerFlee(cx, cy, clientX, clientY);
                }
            });
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        return () => {
            window.removeEventListener("pointermove", onMove);
            if (rafPointerRef.current !== null) cancelAnimationFrame(rafPointerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled, hidden]);

    useEffect(() => {
        return () => {
            window.clearTimeout(bubbleTimerRef.current);
            window.clearTimeout(modeTimerRef.current);
            window.clearTimeout(tiredTimerRef.current);
            window.clearTimeout(catchTimerRef.current);
        };
    }, []);

    if (disabled) {
        return null;
    }

    function triggerFlee(cx: number, cy: number, pointerX: number, pointerY: number) {
        const physics = physicsRef.current;
        let dx = cx - pointerX;
        let dy = cy - pointerY;
        const length = Math.hypot(dx, dy);
        if (length < 1) {
            const angle = Math.random() * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
        } else {
            dx /= length;
            dy /= length;
        }

        const burst = 560 + staminaRef.current * 110;
        physics.vx = dx * burst + (Math.random() - 0.5) * 180;
        physics.vy = dy * burst + (Math.random() - 0.5) * 140;
        const b = bounds();
        physics.targetX = Math.min(Math.max(physics.x + dx * 340, b.minX), b.maxX);
        physics.targetY = Math.min(Math.max(physics.y + dy * 300, b.minY), b.maxY);

        staminaRef.current = Math.max(0, staminaRef.current - 1);
        fleeCountRef.current += 1;
        nextFleeAllowedRef.current = performance.now() + 380;

        setModeBoth("flee");

        if (fleeCountRef.current % 3 === 1) {
            showBubble(FLEE_LINES[Math.floor(Math.random() * FLEE_LINES.length)], 1300);
        }

        window.clearTimeout(modeTimerRef.current);
        modeTimerRef.current = window.setTimeout(() => {
            if (modeRef.current !== "flee") return;
            if (staminaRef.current <= 0) {
                setModeBoth("tired");
                showBubble(TIRED_LINES[Math.floor(Math.random() * TIRED_LINES.length)], 2600);
                window.clearTimeout(tiredTimerRef.current);
                tiredTimerRef.current = window.setTimeout(() => {
                    staminaRef.current = 2;
                    if (modeRef.current === "tired") {
                        setModeBoth("wander");
                    }
                }, 5000);
            } else {
                setModeBoth("wander");
            }
        }, 620);
    }

    function triggerCatch() {
        if (modeRef.current === "caught") return;
        const physics = physicsRef.current;
        physics.vx = 0;
        physics.vy = 0;
        setModeBoth("caught");

        const next = catchesRef.current + 1;
        catchesRef.current = next;
        setCatches(next);
        localStorage.setItem("rin-pet-caught", String(next));

        const line = CATCH_MILESTONES[next] ?? CAUGHT_LINES[Math.floor(Math.random() * CAUGHT_LINES.length)];
        showBubble(line, 3200);

        const spawned: Particle[] = Array.from({ length: 26 }, (_, i) => {
            const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 60 + Math.random() * 90;
            const roll = Math.random();
            return {
                id: Date.now() + i,
                dx: Math.cos(angle) * distance,
                dy: Math.sin(angle) * distance - 20,
                rot: (Math.random() - 0.5) * 540,
                delay: Math.random() * 90,
                kind: roll < 0.55 ? "dot" : roll < 0.78 ? "heart" : "star",
                color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
                size: 6 + Math.random() * 5,
            };
        });
        setParticles(spawned);

        window.clearTimeout(catchTimerRef.current);
        catchTimerRef.current = window.setTimeout(() => {
            setParticles([]);
            staminaRef.current = MAX_STAMINA;
            const next = randomWanderPoint();
            physics.targetX = next.x;
            physics.targetY = next.y;
            setModeBoth("wander");
        }, 2600);
    }

    if (hidden) {
        return (
            <button
                type="button"
                aria-label="显示小宠物"
                title="显示小宠物"
                onClick={() => {
                    localStorage.removeItem("rin-pet-hidden");
                    setHidden(false);
                }}
                className="fixed bottom-4 right-4 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-black/10 bg-w shadow-lg t-primary transition-transform hover:scale-110 dark:border-white/10"
            >
                <i className="ri-paw-fill" aria-hidden="true" />
            </button>
        );
    }

    const tired = mode === "tired";
    const happy = mode === "caught";

    return (
        <div ref={wrapRef} className="fixed left-0 top-0 z-30 select-none" style={{ willChange: "transform" }}>
            {bubble && (
                <div className="pet-bubble absolute -top-2 left-1/2 z-10 w-max max-w-[170px] -translate-x-1/2 -translate-y-full rounded-2xl bg-w px-3 py-1.5 text-sm t-primary shadow-lg">
                    {bubble}
                </div>
            )}
            <div className={`group/fox relative ${tired ? "is-tired" : ""}`}>
                <button
                    type="button"
                    aria-label={`小松鼠，可以抓它玩（已抓住 ${catches} 次）`}
                    onClick={triggerCatch}
                    className="relative block h-[104px] w-[104px] cursor-pointer border-0 bg-transparent p-0 focus:outline-none md:h-[132px] md:w-[132px]"
                >
                    <div ref={visualRef} style={{ willChange: "transform" }}>
                        <div className={happy ? "pet-catch-spin" : tired ? "pet-tired" : undefined}>
                            <div className="absolute bottom-1 left-1/2 h-2 w-20 -translate-x-1/2 rounded-full bg-black/10 dark:bg-black/40" />
                            <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-sm" role="img">
                                <defs>
                                    <linearGradient id="petFur" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#d4915c" />
                                        <stop offset="100%" stopColor="#b06a3b" />
                                    </linearGradient>
                                </defs>

                                {/* 大绒尾巴（S 卷，逃跑时高频甩） */}
                                <g
                                    className={tired ? "pet-tail-slow" : "pet-tail"}
                                    style={{ transformOrigin: "124px 168px", transformBox: "view-box" }}
                                >
                                    <path
                                        d="M126 170 C176 168 196 136 186 94 C182 76 164 68 154 78 C144 88 156 106 150 126 C144 146 132 158 114 162 Z"
                                        fill="url(#petFur)"
                                    />
                                    <path
                                        d="M170 84 C174 74 182 74 186 84 C190 96 188 108 182 118 C178 106 172 94 170 84 Z"
                                        fill="#fff3e4"
                                    />
                                </g>

                                {/* 小身子 */}
                                <ellipse cx="100" cy="170" rx="34" ry="26" fill="url(#petFur)" />
                                <ellipse cx="68" cy="162" rx="9" ry="6" fill="url(#petFur)" />
                                <ellipse cx="132" cy="162" rx="9" ry="6" fill="url(#petFur)" />
                                <ellipse cx="100" cy="177" rx="17" ry="13" fill="#fff3e4" />
                                <ellipse cx="86" cy="193" rx="10" ry="6" fill="#fff3e4" />
                                <ellipse cx="114" cy="193" rx="10" ry="6" fill="#fff3e4" />

                                {/* 脑袋（会歪向鼠标） */}
                                <g
                                    ref={headRef}
                                    className="pet-head"
                                    style={{ transformOrigin: "100px 150px", transformBox: "view-box" }}
                                >
                                    {/* 小圆耳（累了耷拉） */}
                                    <ellipse className="pet-ear-l" cx="62" cy="54" rx="14" ry="16" fill="url(#petFur)" />
                                    <ellipse className="pet-ear-r" cx="138" cy="54" rx="14" ry="16" fill="url(#petFur)" />
                                    <ellipse cx="63" cy="56" rx="7" ry="9" fill="#8a5a33" />
                                    <ellipse cx="137" cy="56" rx="7" ry="9" fill="#8a5a33" />

                                    {/* 大脑袋 */}
                                    <ellipse cx="100" cy="104" rx="56" ry="52" fill="url(#petFur)" />
                                    <circle cx="74" cy="120" r="24" fill="#fff3e4" />
                                    <circle cx="126" cy="120" r="24" fill="#fff3e4" />
                                    <ellipse cx="100" cy="126" rx="22" ry="17" fill="#fff3e4" />

                                    {/* 汗珠（累了才出现） */}
                                    {tired && (
                                        <path
                                            className="pet-sweat"
                                            d="M150 44 C145 53 144 58 150 62 C156 58 155 53 150 44 Z"
                                            fill="#7dd3fc"
                                        />
                                    )}

                                    {/* 大眼睛 */}
                                    <g
                                        className={happy ? undefined : "pet-blink"}
                                        style={{ transformOrigin: "100px 100px", transformBox: "view-box" }}
                                    >
                                        {happy ? (
                                            <>
                                                <circle cx="76" cy="100" r="9" fill="#2d1a16" />
                                                <circle cx="124" cy="100" r="9" fill="#2d1a16" />
                                                <circle cx="73" cy="97" r="3" fill="#fff" />
                                                <circle cx="121" cy="97" r="3" fill="#fff" />
                                            </>
                                        ) : tired ? (
                                            <>
                                                <path d="M67 102 Q76 96 85 102" fill="none" stroke="#2d1a16" strokeWidth="4" strokeLinecap="round" />
                                                <path d="M115 102 Q124 96 133 102" fill="none" stroke="#2d1a16" strokeWidth="4" strokeLinecap="round" />
                                            </>
                                        ) : (
                                            <g ref={pupilRef} style={{ transition: "transform 150ms ease-out" }}>
                                                <ellipse cx="76" cy="100" rx="7" ry="9" fill="#2d1a16" />
                                                <ellipse cx="124" cy="100" rx="7" ry="9" fill="#2d1a16" />
                                                <circle cx="73.5" cy="96.5" r="2.6" fill="#fff" />
                                                <circle cx="121.5" cy="96.5" r="2.6" fill="#fff" />
                                                <circle cx="79" cy="103.5" r="1.2" fill="#fff" opacity="0.85" />
                                                <circle cx="127" cy="103.5" r="1.2" fill="#fff" opacity="0.85" />
                                            </g>
                                        )}
                                    </g>

                                    {/* 酷墨镜：平时戴着（半透明镜片里眼珠高光在动）；被抓时推到头顶；累了挂在鼻尖 */}
                                    {happy ? (
                                        <g>
                                            <rect x="62" y="34" width="30" height="13" rx="6.5" fill="#16181d" />
                                            <rect x="108" y="34" width="30" height="13" rx="6.5" fill="#16181d" />
                                        </g>
                                    ) : tired ? (
                                        <g transform="rotate(-8 100 122) translate(0 16)">
                                            <rect x="60" y="92" width="32" height="14" rx="7" fill="#16181d" />
                                            <rect x="108" y="92" width="32" height="14" rx="7" fill="#16181d" />
                                        </g>
                                    ) : (
                                        <g>
                                            <rect x="60" y="90" width="32" height="15" rx="7" fill="#16181d" opacity="0.55" />
                                            <rect x="108" y="90" width="32" height="15" rx="7" fill="#16181d" opacity="0.55" />
                                            <path d="M92 96 L108 96" stroke="#16181d" strokeWidth="3" strokeLinecap="round" />
                                            <path d="M61 94 L54 90" stroke="#16181d" strokeWidth="3" strokeLinecap="round" />
                                            <path d="M139 94 L146 90" stroke="#16181d" strokeWidth="3" strokeLinecap="round" />
                                        </g>
                                    )}

                                    {/* 鼻子 + 标志性大门牙 */}
                                    <ellipse cx="100" cy="116" rx="4.5" ry="3.5" fill="#2d1a16" />
                                    {happy ? (
                                        <>
                                            <ellipse cx="100" cy="130" rx="7" ry="5.5" fill="#8c5a33" />
                                            <rect x="96.5" y="131" width="7" height="8" rx="2" fill="#fff" />
                                        </>
                                    ) : (
                                        <>
                                            <path
                                                d="M94 122 Q97 125 100 122 Q103 125 106 122"
                                                fill="none"
                                                stroke="#2d1a16"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                            />
                                            <rect x="96.5" y="124" width="7" height="8" rx="2" fill="#fff" stroke="#e8d5c4" strokeWidth="0.8" />
                                        </>
                                    )}

                                    {/* 腮红 */}
                                    <ellipse cx="58" cy="118" rx="7.5" ry="4" fill="#ffb3a0" opacity="0.7" />
                                    <ellipse cx="142" cy="118" rx="7.5" ry="4" fill="#ffb3a0" opacity="0.7" />
                                </g>
                            </svg>
                        </div>
                    </div>

                    {/* 抓捕特效：金环 + 粒子 */}
                    {happy && (
                        <>
                            <span className="pet-ring pointer-events-none absolute inset-0 rounded-full border-4 border-amber-300" />
                            <span
                                className="pet-ring pointer-events-none absolute inset-0 rounded-full border-4 border-rose-300"
                                style={{ animationDelay: "120ms" }}
                            />
                        </>
                    )}
                    {particles.map((particle) => (
                        <span
                            key={particle.id}
                            aria-hidden="true"
                            className={`pet-particle pointer-events-none ${
                                particle.kind === "dot" ? "rounded-full" : ""
                            } ${particle.kind !== "dot" ? `ri-${particle.kind === "heart" ? "heart-3" : "star"}-fill` : ""}`}
                            style={
                                {
                                    "--dx": `${particle.dx}px`,
                                    "--dy": `${particle.dy}px`,
                                    "--rot": `${particle.rot}deg`,
                                    animationDelay: `${particle.delay}ms`,
                                    width: particle.kind === "dot" ? particle.size : undefined,
                                    height: particle.kind === "dot" ? particle.size : undefined,
                                    backgroundColor: particle.kind === "dot" ? particle.color : undefined,
                                    color: particle.kind !== "dot" ? particle.color : undefined,
                                    fontSize: particle.kind !== "dot" ? `${particle.size + 8}px` : undefined,
                                } as CSSProperties
                            }
                        />
                    ))}
                </button>

                <button
                    type="button"
                    aria-label="收起小宠物"
                    title="收起小宠物"
                    onClick={() => {
                        localStorage.setItem("rin-pet-hidden", "1");
                        setHidden(true);
                    }}
                    className="absolute -right-1 -top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-black/10 bg-w text-[10px] t-secondary opacity-0 shadow transition-opacity group-hover/fox:opacity-100 hover:opacity-100 dark:border-white/10"
                >
                    <i className="ri-close-line" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
