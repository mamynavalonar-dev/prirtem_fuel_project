import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "@fontsource/fira-code/latin-600.css";
import "@fontsource/fira-sans/latin-400.css";
import "@fontsource/fira-sans/latin-500.css";
import "@fontsource/fira-sans/latin-600.css";
import "@fontsource/fira-sans/latin-700.css";
import "./Login.css";
import { useAuth } from "../auth/AuthContext.jsx";
import LogoLoop from "../components/LogoLoop.jsx";
import { apiFetch } from "../utils/api.js";

const SLIDES = [
  {
    image: "/ui/login/slides/slide-1.webp",
    kicker: "Traçabilité",
    title: "Chaque demande reste claire, suivie et consultable.",
    subtitle:
      "Centralisez les opérations carburant et flotte dans un espace commun à toutes les équipes.",
    feature: "Historique centralisé",
  },
  {
    image: "/ui/login/slides/slide-2.webp",
    kicker: "Workflow",
    title: "Des validations plus simples, des décisions plus rapides.",
    subtitle:
      "Demandeur, Logistique et RAF avancent dans un circuit de validation lisible et maîtrisé.",
    feature: "Circuit de validation",
  },
  {
    image: "/ui/login/slides/slide-3.webp",
    kicker: "Documents",
    title: "Des documents propres, prêts à contrôler et à signer.",
    subtitle:
      "Retrouvez des formats cohérents, lisibles et adaptés aux usages opérationnels du programme.",
    feature: "Formats prêts à signer",
  },
];

const PARTNER_LOGOS = [
  { src: "/ui/login/logos/prirtem.webp", alt: "PRIRTEM" },
  { src: "/ui/login/logos/logo-meh.webp", alt: "Ministère de l’Énergie et des Hydrocarbures" },
  { src: "/ui/login/logos/eu.webp", alt: "Union européenne" },
  { src: "/ui/login/logos/bei.webp", alt: "Banque européenne d’investissement" },
  { src: "/ui/login/logos/afdb.webp", alt: "Banque africaine de développement" },
  { src: "/ui/login/logos/korea-eximbank.webp", alt: "Korea Eximbank" },
];

const AUTOPLAY_MS = 4500;

function IconUser(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" />
    </svg>
  );
}

function IconLock(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V7Zm3 9.73V18h-2v-1.27a2 2 0 1 1 2 0Z" />
    </svg>
  );
}

function IconEye(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M12 5c5.5 0 9.6 4.5 10.7 6.2a1.4 1.4 0 0 1 0 1.6C21.6 14.5 17.5 19 12 19S2.4 14.5 1.3 12.8a1.4 1.4 0 0 1 0-1.6C2.4 9.5 6.5 5 12 5Zm0 3.2A3.8 3.8 0 1 0 15.8 12 3.8 3.8 0 0 0 12 8.2Z" />
    </svg>
  );
}

function IconEyeOff(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M2.3 3.7 20.3 21.7l1.4-1.4-2.1-2.1c1.6-1.3 2.7-2.8 3.1-3.4a1.4 1.4 0 0 0 0-1.6C21.6 9.5 17.5 5 12 5c-1.8 0-3.4.4-4.9 1.1L3.7 2.3 2.3 3.7ZM12 19c-5.5 0-9.6-4.5-10.7-6.2a1.4 1.4 0 0 1 0-1.6c.5-.8 1.8-2.5 3.8-3.9l1.6 1.6A6.2 6.2 0 0 0 5.8 12 6.2 6.2 0 0 0 12 18.2c1.2 0 2.4-.3 3.4-.8l1.7 1.7c-1.5.6-3.2.9-5.1.9Z" />
      <path fill="currentColor" d="M9.2 11.1 12.9 14.8A3.8 3.8 0 0 1 9.2 11.1Zm5.6 1.8-3.7-3.7A3.8 3.8 0 0 1 14.8 12.9Z" />
    </svg>
  );
}

function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="m12 2 8 3v6c0 5.05-3.41 9.74-8 11-4.59-1.26-8-5.95-8-11V5l8-3Zm0 3.13L7 7v4c0 3.62 2.24 7.16 5 8.32 2.76-1.16 5-4.7 5-8.32V7l-5-1.87Zm-1 9.45-2.3-2.29 1.42-1.41.88.88 2.88-2.88 1.42 1.41L11 14.58Z" />
    </svg>
  );
}

function IconArrow(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="m13.17 5.17 1.41-1.41L22.83 12l-8.25 8.24-1.41-1.41L19 13H2v-2h17l-5.83-5.83Z" />
    </svg>
  );
}

function IconChevron({ direction = "right", ...props }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function getLoginErrorMessage(error) {
  const message = String(error?.message || "").trim();
  if (message === "INVALID_CREDENTIALS" || message === "VALIDATION") {
    return "Identifiant ou mot de passe incorrect.";
  }
  if (/failed to fetch|network|timeout|temps à répondre/i.test(message)) {
    return "Le serveur est momentanément indisponible. Réessayez dans quelques instants.";
  }
  return message || "La connexion n’a pas abouti. Vérifiez vos informations.";
}

const LoginSlideshow = memo(function LoginSlideshow() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const pointerStartRef = useRef(0);
  const isDraggingRef = useRef(false);

  const selectSlide = useCallback((index) => {
    setSlideIndex(((index % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    const handleVisibility = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!isVisible || SLIDES.length < 2) return undefined;
    const interval = setInterval(
      () => setSlideIndex((current) => (current + 1) % SLIDES.length),
      AUTOPLAY_MS,
    );
    return () => clearInterval(interval);
  }, [isVisible]);

  const activeSlide = SLIDES[slideIndex];

  const handlePointerDown = (event) => {
    isDraggingRef.current = true;
    pointerStartRef.current = event.clientX;
  };

  const handlePointerUp = (event) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const distance = event.clientX - pointerStartRef.current;
    if (Math.abs(distance) >= 40) {
      selectSlide(distance > 0 ? slideIndex - 1 : slideIndex + 1);
    }
  };

  return (
    <section className="login-story" aria-label="Présentation de la plateforme">
      <div className="login-story__header">
        <div>
          <p className="login-story__eyebrow">La plateforme en bref</p>
          <p className="login-story__counter">
            <strong>{String(slideIndex + 1).padStart(2, "0")}</strong>
            <span>/ {String(SLIDES.length).padStart(2, "0")}</span>
          </p>
        </div>

        <div className="login-story__controls">
          <button type="button" onClick={() => selectSlide(slideIndex - 1)} aria-label="Diapositive précédente">
            <IconChevron direction="left" />
          </button>
          <button type="button" onClick={() => selectSlide(slideIndex + 1)} aria-label="Diapositive suivante">
            <IconChevron />
          </button>
        </div>
      </div>

      <div className="login-story__viewport" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        <div className="login-story__media" aria-hidden="true">
          {SLIDES.map((slide, index) => (
            <img
              key={slide.image}
              src={slide.image}
              alt=""
              draggable={false}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={index === 0 ? "high" : "low"}
              className={index === slideIndex ? "is-active" : ""}
            />
          ))}
          <div className="login-story__scrim" />
        </div>

        <div className="login-story__content">
          <span className="login-story__chip">{activeSlide.kicker}</span>
          <h2>{activeSlide.title}</h2>
          <p>{activeSlide.subtitle}</p>
        </div>

        <div className="login-story__feature">
          <span aria-hidden="true" />
          {activeSlide.feature}
        </div>
      </div>

      <div className="login-story__pagination" role="tablist" aria-label="Diapositives">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.image}
            type="button"
            role="tab"
            aria-selected={index === slideIndex}
            aria-label={`Diapositive ${index + 1}`}
            className={index === slideIndex ? "is-active" : ""}
            onClick={() => selectSlide(index)}
          >
            <span />
          </button>
        ))}
      </div>
    </section>
  );
});

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoConfig, setDemoConfig] = useState({ enabled: false, roles: [] });
  const [demoRoleLoading, setDemoRoleLoading] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/api/auth/demo-config", { retries: 0, timeoutMs: 5000 })
      .then((config) => {
        if (active && config?.enabled) {
          setDemoConfig({
            enabled: true,
            roles: Array.isArray(config.roles) ? config.roles : [],
          });
        }
      })
      .catch(() => {
        // L'application institutionnelle fonctionne normalement sans mode démo.
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDemoLogin = async (role) => {
    if (loading || demoRoleLoading) return;

    setError("");
    setDemoRoleLoading(role);
    try {
      const response = await apiFetch("/api/auth/demo-login", {
        method: "POST",
        body: { role },
      });
      login(response.user);
      navigate("/app");
    } catch (requestError) {
      setError(getLoginErrorMessage(requestError));
    } finally {
      setDemoRoleLoading("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);
    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      login(response.user);
      navigate("/app");
    } catch (requestError) {
      setError(getLoginErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="login-header__brand">
          <span className="login-header__logo">
            <img src="/ui/login/logos/prirtem.webp" alt="" />
          </span>
          <span className="login-header__identity">
            <strong>PRIRTEM</strong>
            <small>Carburant &amp; flotte</small>
          </span>
        </div>

        <div className="login-header__status">
          <span className="login-header__status-dot" aria-hidden="true" />
          <span>
            <strong>Portail opérationnel</strong>
            <small>Accès institutionnel sécurisé</small>
          </span>
        </div>
      </header>

      <main className="login-shell">
        <section className="login-access" aria-labelledby="login-title">
          <div className="login-access__intro">
            <div className="login-access__badge">
              <IconShield />
              Espace sécurisé
            </div>
            <p className="login-access__overline">Bienvenue sur PRIRTEM</p>
            <h1 id="login-title">Accédez à votre espace de travail.</h1>
            <p className="login-access__lead">
              Connectez-vous pour gérer vos demandes, vos validations et le suivi de la flotte depuis un portail unique.
            </p>
            <div className="login-access__scope" aria-label="Services disponibles">
              <span><i aria-hidden="true" />Demandes</span>
              <span><i aria-hidden="true" />Validations</span>
              <span><i aria-hidden="true" />Flotte</span>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate autoComplete="off">
            <div className="login-field">
              <label htmlFor="login-username">Nom d&apos;utilisateur</label>
              <div className="login-field__control">
                <IconUser className="login-field__icon" />
                <input
                  id="login-username"
                  type="text"
                  name="login_username_field"
                  placeholder="Saisissez votre identifiant"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  data-form-type="other"
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <div className="login-field__heading">
                <label htmlFor="login-password">Mot de passe</label>
                <Link to="/forgot">Mot de passe oublié ?</Link>
              </div>
              <div className="login-field__control">
                <IconLock className="login-field__icon" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  name="login_password_field"
                  placeholder="Saisissez votre mot de passe"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  data-form-type="other"
                  required
                />
                <button
                  type="button"
                  className="login-field__toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="login-form__error" role="alert" aria-live="assertive">
                {error}
              </p>
            ) : null}

            <button type="submit" className="login-submit" disabled={loading} aria-busy={loading}>
              <span>{loading ? "Connexion en cours…" : "Se connecter"}</span>
              {loading ? (
                <span className="login-submit__spinner" aria-hidden="true" />
              ) : (
                <span className="login-submit__arrow" aria-hidden="true">
                  <IconArrow />
                </span>
              )}
            </button>
          </form>

          {demoConfig.enabled ? (
            <section className="login-demo" aria-label="Mode démonstration publique">
              <div className="login-demo__heading">
                <div>
                  <span className="login-demo__eyebrow">Mode démonstration</span>
                  <strong>Tester le workflow avec un rôle</strong>
                </div>
                <span className="login-demo__live">Données fictives</span>
              </div>

              <p className="login-demo__description">
                Ouvrez une session de démonstration sans mot de passe. Les opérations sensibles
                sur le référentiel global restent protégées.
              </p>

              <div className="login-demo__actions">
                {demoConfig.roles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="login-demo__button"
                    disabled={loading || Boolean(demoRoleLoading)}
                    aria-busy={demoRoleLoading === role}
                    onClick={() => handleDemoLogin(role)}
                  >
                    <span>
                      {role === "DEMANDEUR"
                        ? "Demandeur"
                        : role === "LOGISTIQUE"
                          ? "Logistique"
                          : "RAF"}
                    </span>
                    <small>
                      {demoRoleLoading === role ? "Ouverture…" : "Tester ce rôle"}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <footer className="login-access__footer">
            <IconShield />
            <span>
              <strong>Connexion protégée</strong>
              <small>Portail réservé aux utilisateurs autorisés</small>
            </span>
          </footer>
        </section>

        <LoginSlideshow />
      </main>

      <footer className="login-partners">
        <div className="login-partners__label">
          <span>Avec le soutien de</span>
          <strong>Nos partenaires institutionnels</strong>
        </div>
        <div className="login-partners__track">
          <LogoLoop
            logos={PARTNER_LOGOS}
            speed={12}
            direction="left"
            logoHeight={28}
            gap={36}
            hoverSpeed={4}
            scaleOnHover={false}
            fadeOut
            fadeOutColor="#ffffff"
            ariaLabel="Partenaires institutionnels"
          />
        </div>
      </footer>
    </div>
  );
}
