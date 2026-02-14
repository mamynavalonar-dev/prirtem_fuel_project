// src/pages/Login.jsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiFetch } from "../utils/api.js";
import LogoLoop from "../components/LogoLoop.jsx";
import FloatingLines from "../components/FloatingLines.jsx";



/* Assets (dans /public) */
const BTN_BG = "/ui/login/Rectangle%206.png"; // espace encodé
const SUBTRACT_MASK_URL = 'url("/ui/login/Subtract-mask.svg")';

/* ✅ 3 images (pas répétées) */
const LEFT_SLIDES = [
  "/ui/login/slides/slide-1.png",
  "/ui/login/slides/slide-2.png",
  "/ui/login/slides/slide-3.png",
];

/* ✅ Logos topbar (dans client/public/ui/login/logos/) */
const TOPBAR_LOGOS = [
  { src: "/ui/login/logos/prirtem.png", alt: "Prirtem", href: "#" },
  { src: "/ui/login/logos/logo-meh.png", alt: "MEH", href: "#" },
  { src: "/ui/login/logos/eu.png", alt: "European Union", href: "#" },
  { src: "/ui/login/logos/bei.png", alt: "BEI", href: "#" },
  { src: "/ui/login/logos/afdb.png", alt: "AfDB", href: "#" },
  { src: "/ui/login/logos/korea-eximbank.png", alt: "Korea Eximbank", href: "#" },
];

/* ✅ Réglages slider */
const AUTOPLAY_MS = 2600;
const TRANSITION_MS = 650;
const SWIPE_THRESHOLD_RATIO = 0.18;

const ELLIPSE_LOGO = "/ui/login/logos/prirtem.png";


/* ---------- Inline SVG Icons (0 dépendance) ---------- */
function IconUser(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"
      />
    </svg>
  );
}
function IconLock(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M17 10h-1V8a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v7a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-7a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V8Z"
      />
    </svg>
  );
}
function IconEye(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.6 4.5 10.7 6.2a1.4 1.4 0 0 1 0 1.6C21.6 14.5 17.5 19 12 19S2.4 14.5 1.3 12.8a1.4 1.4 0 0 1 0-1.6C2.4 9.5 6.5 5 12 5Zm0 3.2A3.8 3.8 0 1 0 15.8 12 3.8 3.8 0 0 0 12 8.2Z"
      />
    </svg>
  );
}
function IconEyeOff(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M2.3 3.7 20.3 21.7l1.4-1.4-2.1-2.1c1.6-1.3 2.7-2.8 3.1-3.4a1.4 1.4 0 0 0 0-1.6C21.6 9.5 17.5 5 12 5c-1.8 0-3.4.4-4.9 1.1L3.7 2.3 2.3 3.7ZM12 19c-5.5 0-9.6-4.5-10.7-6.2a1.4 1.4 0 0 1 0-1.6c.5-.8 1.8-2.5 3.8-3.9l1.6 1.6A6.2 6.2 0 0 0 5.8 12 6.2 6.2 0 0 0 12 18.2c1.2 0 2.4-.3 3.4-.8l1.7 1.7c-1.5.6-3.2.9-5.1.9Z"
      />
      <path
        fill="currentColor"
        d="M9.2 11.1 12.9 14.8A3.8 3.8 0 0 1 9.2 11.1Zm5.6 1.8-3.7-3.7A3.8 3.8 0 0 1 14.8 12.9Z"
      />
    </svg>
  );
}
function IconFacebook(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M13.5 22v-8h2.7l.4-3H13.5V9.1c0-.9.3-1.5 1.6-1.5h1.7V5a22 22 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3V11H7.5v3h2.6v8h3.4Z"
      />
    </svg>
  );
}
function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm9 2h-9A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9A3.5 3.5 0 0 0 20 16.5v-9A3.5 3.5 0 0 0 16.5 4Zm-4.5 3.2A4.8 4.8 0 1 1 7.2 12 4.8 4.8 0 0 1 12 7.2Zm0 2A2.8 2.8 0 1 0 14.8 12 2.8 2.8 0 0 0 12 9.2ZM17.6 6.7a1 1 0 1 1-1 1 1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}
function IconX(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.4L6.3 22H2l7.4-8.5L1 2h6.4l4.3 5.8L18.9 2Zm-1.1 18h1.7L6.1 3.9H4.3L17.8 20Z"
      />
    </svg>
  );
}
function IconGitHub(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 .9A11.2 11.2 0 0 0 8.5 22c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4a3.2 3.2 0 0 0-1.3-1.8c-1.1-.7.1-.7.1-.7a2.5 2.5 0 0 1 1.8 1.2 2.6 2.6 0 0 0 3.6 1 2.6 2.6 0 0 1 .8-1.6c-2.6-.3-5.2-1.3-5.2-5.8a4.6 4.6 0 0 1 1.2-3.2 4.2 4.2 0 0 1 .1-3.1s1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2a4.2 4.2 0 0 1 .1 3.1 4.6 4.6 0 0 1 1.2 3.2c0 4.5-2.6 5.5-5.2 5.8a2.9 2.9 0 0 1 .9 2.2v3.2c0 .3.2.7.8.6A11.2 11.2 0 0 0 12 .9Z"
      />
    </svg>
  );
}

/* ✅ TON TOPBAR (INLINE) */
function TopbarPill(props) {
  return (
    <svg
      width="739"
      height="125"
      viewBox="0 0 739 125"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect width="739" height="125" rx="62.5" fill="rgba(47, 35, 66, 0.69)" />
    </svg>
  );
}

/* ✅ TON ELLIPSE BLANC (INLINE) */
function WhiteEllipse({ logoSrc, ...props }) {
  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* fond rond blanc */}
      <circle cx="70" cy="70" r="70" fill="white" />

      {/* logo centré */}
      {logoSrc ? (
        <image
          href={logoSrc}
          x="35"
          y="35"
          width="70"
          height="70"
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
    </svg>
  );
}


export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ✅ Fix Chrome mask : nudge + remount */
  const [maskNudge, setMaskNudge] = useState(0);

  /* ✅ Slider state */
  const realCount = LEFT_SLIDES.length;

  const slides = useMemo(() => {
    if (realCount < 2) return [...LEFT_SLIDES];
    return [LEFT_SLIDES[realCount - 1], ...LEFT_SLIDES, LEFT_SLIDES[0]];
  }, [realCount]);

  const [idx, setIdx] = useState(realCount >= 2 ? 1 : 0);
  const idxRef = useRef(idx);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState === "visible");
  const [transitionOn, setTransitionOn] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);

  const leftRef = useRef(null);
  const mediaRef = useRef(null);
  const widthRef = useRef(1);
  const startXRef = useRef(0);
  const timerRef = useRef(null);

  const stopAutoplay = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const activeDot = realCount >= 2 ? ((idx - 1 + realCount) % realCount) : 0;

  useEffect(() => {
    const savedRemember = localStorage.getItem("rememberLogin");
    const savedUsername = localStorage.getItem("savedUsername");

    if (savedRemember === "true") {
      setRemember(true);
      if (savedUsername) setUsername(savedUsername);
    }
  }, []);

// ✅ Stabilise slider + mask quand Chrome minimise/restaure la fenêtre
const normalizeIdx = useCallback(() => {
  if (realCount < 2) return;

  const v = idxRef.current;
  const max = realCount + 1;

  // cas "clones" (transitionend pas déclenché en arrière-plan)
  if (v === 0) {
    setTransitionOn(false);
    setIdx(realCount);
    requestAnimationFrame(() => requestAnimationFrame(() => setTransitionOn(true)));
    return;
  }
  if (v === max) {
    setTransitionOn(false);
    setIdx(1);
    requestAnimationFrame(() => requestAnimationFrame(() => setTransitionOn(true)));
    return;
  }

  // cas extrême : idx parti trop loin (timer throttlé + transitions gelées)
  if (v < 0 || v > max) {
    const dot = ((v - 1) % realCount + realCount) % realCount; // 0..realCount-1
    const target = dot + 1; // 1..realCount
    setTransitionOn(false);
    setIdx(target);
    requestAnimationFrame(() => requestAnimationFrame(() => setTransitionOn(true)));
  }
}, [realCount]);

const repaintMaskNow = useCallback(() => {
  const el = mediaRef.current;
  if (!el) return;

  // toggle mask pour forcer un repaint GPU (workaround bug Chrome "mask => vert / vide")
  el.style.webkitMaskImage = "none";
  el.style.maskImage = "none";
  void el.offsetHeight;

  requestAnimationFrame(() => {
    const el2 = mediaRef.current;
    if (!el2) return;
    el2.style.webkitMaskImage = SUBTRACT_MASK_URL;
    el2.style.maskImage = SUBTRACT_MASK_URL;
    void el2.offsetHeight;
  });
}, []);

const forceMaskRepaint = useCallback(() => {
  // 1) nudge (style) + remount
  setMaskNudge((n) => n + 1);

  // 2) repaint *après* le remount (double RAF)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => repaintMaskNow());
  });

  // 3) maj largeur pour swipe
  requestAnimationFrame(() => {
    const el = leftRef.current;
    if (el) widthRef.current = Math.max(1, el.getBoundingClientRect().width);
  });
}, [repaintMaskNow]);

// ✅ quand maskNudge change (remount), on réapplique le mask sur le nouveau noeud
useLayoutEffect(() => {
  requestAnimationFrame(() => repaintMaskNow());
}, [maskNudge, repaintMaskNow]);

useEffect(() => {
  const onVis = () => {
    const visible = document.visibilityState === "visible";
    setIsPageVisible(visible);

    if (!visible) {
      stopAutoplay();
      return;
    }

    normalizeIdx();
    forceMaskRepaint();
  };

  const onFocus = () => {
    setIsPageVisible(true);
    normalizeIdx();
    forceMaskRepaint();
  };

  const onBlur = () => {
    setIsPageVisible(false);
    stopAutoplay();
  };

  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", forceMaskRepaint);
  window.addEventListener("pageshow", onFocus);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("resize", forceMaskRepaint);
    window.removeEventListener("pageshow", onFocus);
    document.removeEventListener("visibilitychange", onVis);
  };
}, [forceMaskRepaint, normalizeIdx, stopAutoplay]);


  /* ✅ mesure largeur pour swipe */
  useEffect(() => {
    const el = leftRef.current;
    if (!el) return;

    const measure = () => {
      widthRef.current = Math.max(1, el.getBoundingClientRect().width);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

/* ✅ autoplay (pause pendant drag + pause en arrière-plan) */
useEffect(() => {
  stopAutoplay();
  if (!isPageVisible || isDragging || realCount < 2) return;

  timerRef.current = setInterval(() => {
    setIdx((v) => v + 1);
  }, AUTOPLAY_MS);

  return stopAutoplay;
}, [stopAutoplay, isPageVisible, isDragging, realCount]);


  const jumpTo = (target) => {
    setTransitionOn(false);
    setIdx(target);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionOn(true));
    });
  };

  const onSliderTransitionEnd = () => {
    if (realCount < 2) return;
    if (idx === 0) jumpTo(realCount);
    if (idx === realCount + 1) jumpTo(1);
  };

  const shouldIgnoreDragTarget = (target) => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest("a,button,input,textarea,select");
  };

  const onPointerDown = (e) => {
    if (shouldIgnoreDragTarget(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    stopAutoplay();
    setIsDragging(true);
    setDragX(0);
    startXRef.current = e.clientX;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    setDragX(e.clientX - startXRef.current);
  };

  const onPointerUp = () => {
    if (!isDragging) return;

    const w = widthRef.current;
    const threshold = Math.max(60, w * SWIPE_THRESHOLD_RATIO);

    const delta = dragX;
    setDragX(0);
    setIsDragging(false);

    if (delta > threshold) {
      setIdx((v) => v - 1);
      return;
    }
    if (delta < -threshold) {
      setIdx((v) => v + 1);
      return;
    }
  };

  const goToDot = (dotIndex) => {
    if (realCount < 2) return;
    stopAutoplay();
    setIdx(dotIndex + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });

      login(res.token, res.user);

      if (remember) {
        localStorage.setItem("rememberLogin", "true");
        localStorage.setItem("savedUsername", username);
      } else {
        localStorage.removeItem("rememberLogin");
        localStorage.removeItem("savedUsername");
      }

      navigate("/app");
    } catch (err) {
      setError(err?.message || "Identifiants incorrects.");
    } finally {
      setLoading(false);
    }
  };

  const baseTranslate = -idx * 100;
  const dragPercent = isDragging ? (dragX / widthRef.current) * 100 : 0;
  const translate = baseTranslate + dragPercent;

  return (
    <div className="loginExact">
      {/* ✅ Background animé (derrière tout) */}
        <div className="loginExact__bg" aria-hidden="true">
          <FloatingLines
            interactive={false}
            parallax={false}
            animationSpeed={1.1}
            mixBlendMode="screen"
          />
          <div className="loginExact__bgOverlay" />
        </div>


      {/* ✅ TOPBAR (logos loop dans la pill) */}
      <div className="loginExact__topbarRight" aria-hidden="true">
        <div className="loginExact__topbarWrap">
          <TopbarPill className="loginExact__topbarRightSvg" />

          <div className="loginExact__topbarLogos">
            <LogoLoop
              logos={TOPBAR_LOGOS}
              speed={20}
              direction="left"
              logoHeight={32}
              gap={26}
              hoverSpeed={0}
              scaleOnHover={false}
              fadeOut
              fadeOutColor="#26212d87"
              ariaLabel="Topbar logos"
            />
          </div>
        </div>
      </div>

      {/* ✅ ELLIPSE blanc */}
      <WhiteEllipse className="loginExact__ellipse" logoSrc={ELLIPSE_LOGO} />


      {/* ✅ La grande fenêtre (forme Union) */}
      <div className="loginExact__shape">
        <div className="loginExact__card">
          {/* LEFT */}
          <div
            className="loginExact__left"
            ref={leftRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              className="loginExact__leftMedia"
              ref={mediaRef}
              aria-hidden="true"
              key={maskNudge} // ✅ remount
              style={{
                WebkitMaskSize: maskNudge % 2 ? "99.9% 99.9%" : "100% 100%",
                maskSize: maskNudge % 2 ? "99.9% 99.9%" : "100% 100%",
              }}
            >
              <div
                className={`loginExact__leftSlider ${isDragging ? "is-dragging" : ""}`}
                style={{
                  transform: `translateX(${translate}%)`,
                  transition:
                    transitionOn && !isDragging
                      ? `transform ${TRANSITION_MS}ms ease`
                      : "none",
                }}
                onTransitionEnd={onSliderTransitionEnd}
              >
                {slides.map((src, i) => (
                  <div className="loginExact__leftSlide" key={`${src}-${i}`}>
                    <img src={src} alt="" draggable={false} />
                  </div>
                ))}
              </div>
            </div>

            <div className="loginExact__leftContent">
              <div>
                <div className="loginExact__kicker">Welcome Back</div>
                <h2 className="loginExact__heroTitle">
                  Hello Developer,
                  <br />
                  Sign In To Get Started
                </h2>
              </div>

              <div className="loginExact__social">
                <div className="loginExact__socialLabel">Our Social Media</div>
                <div className="loginExact__socialIcons">
                  <a href="#" aria-label="Facebook">
                    <IconFacebook />
                  </a>
                  <a href="#" aria-label="Instagram">
                    <IconInstagram />
                  </a>
                  <a href="#" aria-label="X">
                    <IconX />
                  </a>
                  <a href="#" aria-label="Github">
                    <IconGitHub />
                  </a>
                </div>
              </div>
            </div>

            {realCount >= 2 ? (
              <div className="loginExact__leftDots" aria-label="Slides">
                {LEFT_SLIDES.map((_, d) => (
                  <button
                    key={d}
                    type="button"
                    className={`loginExact__dot ${d === activeDot ? "is-active" : ""}`}
                    aria-label={`Aller au slide ${d + 1}`}
                    onClick={() => goToDot(d)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* RIGHT */}
          <div className="loginExact__right">
            <div className="loginExact__rightBg" />

            <div className="loginExact__panel">
              <h1 className="loginExact__title">
                Welcome Back <span className="loginExact__wave">👋</span>
              </h1>

              <form className="loginExact__form" onSubmit={handleSubmit}>
                <div className="loginExact__field">
                  <input
                    className="loginExact__input"
                    type="text"
                    placeholder="Nom d'utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                  <span className="loginExact__icon">
                    <IconUser />
                  </span>
                </div>

                <div className="loginExact__field">
                  <input
                    className="loginExact__input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  {/* <span className="loginExact__icon">
                    <IconLock />
                  </span> */}

                  <button
                    className="loginExact__toggle"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>

                <div className="loginExact__row">
                  {/* <label className="loginExact__remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>Se souvenir de moi</span>
                  </label> */}

                  <Link className="loginExact__forgot" to="/forgot">
                    Mot de passe oublié ?
                  </Link>
                </div>

                {error ? <div className="loginExact__error">{error}</div> : null}

                <button
                  className="loginExact__submit animated-button"
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {/* flèche droite (sort) */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="arr-1" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
                  </svg>

                  <span className="text">{loading ? "Connexion..." : "Se connecter"}</span>
                  <span className="circle" />

                  {/* flèche gauche (entre) */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="arr-2" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
                  </svg>
                </button>

              </form>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ NOTE invalid hook call : routes -> element={<Login />} (PAS Login()) */}
    </div>
  );
}
