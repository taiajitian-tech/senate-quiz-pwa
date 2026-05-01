import { useEffect, useState } from "react";
import Learn from "./components/Learn";
import SenatorList from "./components/SenatorList";
import StatsView from "./components/StatsView";
import BackupView from "./components/BackupView";
import AutoPlayView from "./components/AutoPlayView";
import TitleView from "./components/TitleView";
import ErrorBoundary from "./components/ErrorBoundary";
import FirstGuide, { FIRST_GUIDE_SEEN_KEY } from "./components/FirstGuide";
import UpdatesView from "./components/UpdatesView";
import { getAvailableTargets, type AppMode, type Target } from "./components/data";

type Screen = "title" | "learn" | "reverse" | "review" | "autoplay" | "stats" | "list" | "backup" | "updates";

type ListJump = {
  target: Target;
  name: string;
  nonce: number;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [appMode, setAppMode] = useState<AppMode>("basic");
  const [target, setTarget] = useState<Target>("senators");
  const [guideOpen, setGuideOpen] = useState(() => {
    const shouldOpen = !localStorage.getItem(FIRST_GUIDE_SEEN_KEY);
    if (shouldOpen) localStorage.setItem(FIRST_GUIDE_SEEN_KEY, "1");
    return shouldOpen;
  });
  const [listJump, setListJump] = useState<ListJump | null>(null);

  useEffect(() => {
    const availableTargets = getAvailableTargets(appMode);
    if (!availableTargets.includes(target)) {
      Promise.resolve().then(() => {
        setTarget(availableTargets[0]);
      });
    }
  }, [appMode, target]);

  const openPersonFromUpdates = (nextTarget: Target, name: string) => {
    setTarget(nextTarget);
    setListJump({ target: nextTarget, name, nonce: Date.now() });
    setScreen("list");
  };

  let content: React.ReactNode = null;

  if (screen === "title") {
    content = (
      <TitleView
        appMode={appMode}
        onChangeAppMode={setAppMode}
        target={target}
        onChangeTarget={setTarget}
        onOpenFirstGuide={() => setGuideOpen(true)}
        onStartLearn={() => setScreen("learn")}
        onStartReverse={() => setScreen("reverse")}
        onStartReview={() => setScreen("review")}
        onOpenAutoplay={() => setScreen("autoplay")}
        onOpenStats={() => setScreen("stats")}
        onOpenList={() => setScreen("list")}
        onOpenBackup={() => setScreen("backup")}
        onOpenUpdates={() => setScreen("updates")}
      />
    );
  } else if (screen === "stats") {
    content = <StatsView appMode={appMode} target={target} onBack={() => setScreen("title")} />;
  } else if (screen === "list") {
    content = (
      <SenatorList
        appMode={appMode}
        target={target}
        onChangeTarget={setTarget}
        onBack={() => setScreen("title")}
        focusPersonName={listJump && listJump.target === target ? listJump.name : undefined}
        focusNonce={listJump && listJump.target === target ? listJump.nonce : undefined}
      />
    );
  } else if (screen === "learn") {
    content = <Learn appMode={appMode} target={target} mode="learn" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "reverse") {
    content = <Learn appMode={appMode} target={target} mode="reverse" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "review") {
    content = <Learn appMode={appMode} target={target} mode="review" onBackTitle={() => setScreen("title")} />;
  } else if (screen === "autoplay") {
    content = <AutoPlayView appMode={appMode} target={target} onBack={() => setScreen("title")} />;
  } else if (screen === "backup") {
    content = <BackupView onBack={() => setScreen("title")} />;
  } else if (screen === "updates") {
    content = <UpdatesView onBack={() => setScreen("title")} onOpenPerson={openPersonFromUpdates} />;
  }

  return (
    <ErrorBoundary>
      {content}
      <FirstGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </ErrorBoundary>
  );
}
