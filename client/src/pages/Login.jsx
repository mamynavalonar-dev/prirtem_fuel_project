// src/pages/Login.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiFetch } from "../utils/api.js";
import LogoLoop from "../components/LogoLoop.jsx";
import Ballpit from "../components/Ballpit.jsx";

/* Assets (dans /public) */
const LEFT_SLIDES = [
  "/ui/login/slides/slide-1.png",
  "/ui/login/slides/slide-2.png",
  "/ui/login/slides/slide-3.png",
];

const SLIDE_COPY = [
  {
    kicker: "Traçabilité",
    title: "Pilotez vos demandes en toute traçabilité",
    subtitle: "Carburant & flotte : tout est enregistré, clair, consultable.",
  },
  {
    kicker: "Workflow",
    title: "Validation simple, décisions rapides",
    subtitle: "Demandeur → Logistique → RAF : un flux maîtrisé.",
  },
  {
    kicker: "Suivi & impression",
    title: "Suivi + impression A5, prêt à signer",
    subtitle: "Documents propres, lisibles, conformes aux formulaires.",
  },
];

const TOPBAR_LOGOS = [
  { src: "/ui/login/logos/prirtem.png", alt: "Prirtem", href: "#" },
  { src: "/ui/login/logos/logo-meh.png", alt: "MEH", href: "#" },
  { src: "/ui/login/logos/eu.png", alt: "European Union", href: "#" },
  { src: "/ui/login/logos/bei.png", alt: "BEI", href: "#" },
  { src: "/ui/login/logos/afdb.png", alt: "AfDB", href: "#" },
  {
    src: "/ui/login/logos/korea-eximbank.png",
    alt: "Korea Eximbank",
    href: "#",
  },
];

const AUTOPLAY_MS = 4500;

/* ---------- Icônes inline (légères, pas de dépendance) ---------- */
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
export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  // ✅ CORRECTIF : on ne retire plus l'attribut autocomplete au montage.
  // Ce code faisait l'inverse de ce qu'on voulait : en supprimant
  // autocomplete="off", il laissait Chrome pré-remplir automatiquement
  // les champs avec les derniers identifiants enregistrés pour ce
  // domaine, dès le chargement de la page. Les attributs autoComplete
  // corrects sont maintenant posés directement sur les <input> plus bas
  // (voir name="login_username_field" / autoComplete="new-password").

  /* ---------- Carrousel simple, sans clones ni masque ---------- */
  const [slideIdx, setSlideIdx] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const timerRef = useRef(null);

  const goToSlide = useCallback((i) => {
    setSlideIdx(
      ((i % LEFT_SLIDES.length) + LEFT_SLIDES.length) % LEFT_SLIDES.length,
    );
  }, []);

  useEffect(() => {
    const onVis = () =>
      setIsPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!isPageVisible || LEFT_SLIDES.length < 2) return undefined;
    timerRef.current = setInterval(() => {
      setSlideIdx((v) => (v + 1) % LEFT_SLIDES.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timerRef.current);
  }, [isPageVisible]);

  const activeCopy = SLIDE_COPY[slideIdx] || SLIDE_COPY[0];

  /* ---------- Swipe tactile simple (pointer events) ---------- */
  const startXRef = useRef(0);
  const draggingRef = useRef(false);

  const onPointerDown = (e) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
  };
  const onPointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) goToSlide(slideIdx - 1);
    else goToSlide(slideIdx + 1);
  };

  /* ---------- Soumission du formulaire ---------- */
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
      navigate("/app");
    } catch (err) {
      setError(err?.message || "Identifiants incorrects.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <header className="login-topbar">
        <div className="login-topbar__brand">
          <img src="/ui/login/logos/prirtem.png" alt="PRIRTEM" />
          <span>PRIRTEM</span>
        </div>

        <div className="login-topbar__partners">
          <LogoLoop
            logos={TOPBAR_LOGOS}
            speed={12}
            direction="left"
            logoHeight={20}
            gap={16}
            hoverSpeed={0}
            scaleOnHover={false}
            fadeOut
            fadeOutColor="rgba(11, 11, 18, 0.85)"
            ariaLabel="Partenaires"
          />
        </div>
      </header>

      <main className="login-main">
        <section
          className="login-showcase"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="login-showcase__image-wrap">
            {LEFT_SLIDES.map((src, i) => (
              <img
                key={src}
                src={src}
                alt=""
                draggable={false}
                className="login-showcase__image"
                style={{ opacity: i === slideIdx ? 1 : 0 }}
              />
            ))}
            <div className="login-showcase__scrim" />
          </div>

          <div className="login-showcase__content">
            <p className="login-showcase__kicker">{activeCopy.kicker}</p>
            <h2 className="login-showcase__title">{activeCopy.title}</h2>
            <p className="login-showcase__subtitle">{activeCopy.subtitle}</p>

            <a
              className="login-showcase__social"
              href="https://web.facebook.com/PRIRTEM/?locale=fr_FR&_rdc=1&_rdr"
              target="_blank"
              rel="noreferrer"
            >
              <IconFacebook />
              <span>Suivre PRIRTEM sur Facebook</span>
            </a>
          </div>

          <div
            className="login-showcase__dots"
            role="tablist"
            aria-label="Diapositives"
          >
            {LEFT_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === slideIdx}
                aria-label={`Diapositive ${i + 1}`}
                className={`login-dot ${i === slideIdx ? "is-active" : ""}`}
                onClick={() => goToSlide(i)}
              />
            ))}
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-panel__bg" aria-hidden="true">
            <Ballpit
              count={120}
              gravity={0.015}
              friction={0.99}
              wallBounce={0.9}
              followCursor={false}
              colors={[0x4c1d95, 0x6d28d9, 0x8b5cf6, 0x27272a]}
            />
          </div>

          <div className="login-form-card">
            <h1 className="login-form-card__title">Bienvenue</h1>
            <p className="login-form-card__subtitle">
              Connectez-vous pour accéder à votre espace PRIRTEM.
            </p>

            <form
              className="login-form"
              onSubmit={handleSubmit}
              noValidate
              autoComplete="off"
            >
              <label className="login-field">
                <span className="login-field__label">
                  Nom d&apos;utilisateur
                </span>
                <span className="login-field__control">
                  <IconUser className="login-field__icon" />
                  <input
                    ref={usernameRef}
                    type="text"
                    name="login_username_field"
                    placeholder="ex. jrakoto"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    data-form-type="other"
                    required
                  />
                </span>
              </label>

              <label className="login-field">
                <span className="login-field__label">Mot de passe</span>
                <span className="login-field__control">
                  <input
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    name="login_password_field"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    data-form-type="other"
                    required
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    title={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </span>
              </label>

              <div className="login-form__row">
                <Link className="login-form__forgot" to="/forgot">
                  Mot de passe oublié ?
                </Link>
              </div>

              {error ? (
                <p className="login-form__error" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                className="login-submit animated-button"
                disabled={loading}
                aria-busy={loading}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="arr-2"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
                </svg>
                <span className="text">
                  {loading ? "Connexion..." : "Se connecter"}
                </span>
                <span className="circle" />
                <svg
                  viewBox="0 0 24 24"
                  className="arr-1"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z" />
                </svg>
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
