import { Component, Suspense } from "react";
import { useLanguage } from "../lib/i18n.jsx";

function LoadingError() {
  const { t } = useLanguage();
  return <div className="status error" role="alert">
    <p>{t("Unable to load this screen. Please reload and try again.")}</p>
    <button type="button" className="secondary-button" onClick={() => window.location.reload()}>{t("Reload")}</button>
  </div>;
}

class LoadingBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Unable to render screen", error);
  }

  render() {
    return this.state.failed ? <LoadingError /> : this.props.children;
  }
}

export default function AsyncContent({ children }) {
  const { t } = useLanguage();
  return <LoadingBoundary>
    <Suspense fallback={<div className="page-status compact" role="status">{t("loadingMonitorData")}</div>}>
      {children}
    </Suspense>
  </LoadingBoundary>;
}
