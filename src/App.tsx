import { CalendarCheck, LoaderCircle, RefreshCw, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAvailableUpdate } from "./platform/updates.ts";
import { useAppStore } from "./store/AppStore.tsx";
import { MatchDayScreen } from "./ui/screens/MatchDayScreen.tsx";
import { SetupScreen } from "./ui/screens/SetupScreen.tsx";
import { SummaryScreen } from "./ui/screens/SummaryScreen.tsx";
import { TeamScreen } from "./ui/screens/TeamScreen.tsx";

type Tab = "today" | "team";

export function App() {
  const store = useAppStore();
  const [tab, setTab] = useState<Tab>("today");
  const update = useAvailableUpdate();

  let content: ReactNode;
  if (store.status === "loading") {
    content = (
      <div className="grid flex-1 place-items-center py-24 text-gray-500" role="status">
        <LoaderCircle className="animate-spin" size={32} aria-label="Loading" />
      </div>
    );
  } else if (store.status === "error") {
    content = (
      <p role="alert" className="m-4 rounded-xl bg-red-50 p-4 text-red-800">
        Iedereen Speelt could not open its storage: {store.message}. Private browsing can block storage — try a normal
        window or the installed app.
      </p>
    );
  } else {
    // Both tabs stay mounted so unsaved choices (e.g. who is absent today) survive switching tabs.
    content = (
      <>
        <div hidden={tab !== "today"}>
          {store.data.activeDay ? (
            <MatchDayScreen />
          ) : store.data.summaryDayId ? (
            <SummaryScreen dayId={store.data.summaryDayId} />
          ) : (
            <SetupScreen />
          )}
        </div>
        <div hidden={tab !== "team"}>
          <TeamScreen />
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 bg-green-700 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <img src="favicon.svg" alt="" className="size-7" /> Iedereen Speelt
        </div>
      </header>

      {update && (
        <div className="flex items-center justify-between gap-2 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          A new version is ready.
          <button type="button" onClick={update} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 font-bold text-white">
            <RefreshCw size={16} /> Update
          </button>
        </div>
      )}
      {store.status === "ready" && store.saveError && (
        <p role="alert" className="bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          {store.saveError}
        </p>
      )}

      <main className="flex-1 px-4 pt-4 pb-28">{content}</main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md">
          <TabButton active={tab === "today"} onClick={() => setTab("today")} icon={<CalendarCheck size={24} />}>
            Today
          </TabButton>
          <TabButton active={tab === "team"} onClick={() => setTab("team")} icon={<Users size={24} />}>
            Team
          </TabButton>
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-sm font-bold ${
        active ? "text-green-700" : "text-gray-500"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
