import { useEffect, useState } from "react";
import type { OnboardingSnapshot } from "@campus-job-agent/contracts";
import { browserOnboardingApi, type OnboardingApi } from "./api";
import { PreferencesCard } from "./components/PreferencesCard";
import { ProfileCard } from "./components/ProfileCard";

const MISSING_LABELS: Record<string, string> = {
  "profile.name": "姓名或称呼",
  "profile.city": "当前城市",
  "profile.education": "学历、专业和毕业时间",
  "preferences.role": "目标岗位",
  "preferences.recruitmentType": "招聘类型",
  "preferences.location": "目标城市",
  "preferences.internshipAvailability": "实习时间安排",
  "facts.education": "教育经历",
  "facts.experience": "项目、实习或技能经历",
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "本地资料读取失败";
}

export interface AppProps {
  api?: OnboardingApi;
}

export function App({ api = browserOnboardingApi }: AppProps) {
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [manualReady, setManualReady] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    void api.getSnapshot().then(
      (next) => {
        if (!current) return;
        setSnapshot(next);
        setLoading(false);
      },
      (error: unknown) => {
        if (!current) return;
        setLoadError(errorMessage(error));
        setLoading(false);
      },
    );
    return () => { current = false; };
  }, [api, reload]);

  if (loading) {
    return <main className="state-page"><p role="status">正在读取本地资料…</p></main>;
  }
  if (!snapshot || loadError) {
    return (
      <main className="state-page">
        <div className="card load-error">
          <h1>资料暂时无法读取</h1>
          <p role="alert">{loadError || "本地资料读取失败"}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>重试</button>
        </div>
      </main>
    );
  }

  const profileExists = Boolean(snapshot.profile?.displayName);
  const totalFacts = Object.values(snapshot.factCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="brand-kicker">Campus Job Agent</p>
          <h1>建立你的求职资料库</h1>
        </div>
        <p className="privacy-note">资料保存在本机；投递始终由你手动完成。</p>
      </header>

      <div className="workspace">
        <aside className="left-rail" aria-label="资料完成情况">
          <section className="completion-card">
            <p className="eyebrow">资料完成度</p>
            <strong className="completion-number">{snapshot.completion.percentage}%</strong>
            <progress
              max="100"
              value={snapshot.completion.percentage}
              aria-label={`资料完成度：${snapshot.completion.percentage}%`}
            />
            {snapshot.completion.missing.length > 0 ? (
              <>
                <h2>接下来补充</h2>
                <ul className="checklist">
                  {snapshot.completion.missing.map((item) => <li key={item}>{MISSING_LABELS[item] ?? item}</li>)}
                </ul>
              </>
            ) : <p className="complete-message">基础资料已齐全</p>}
          </section>

          <nav className="section-nav" aria-label="工作台分区">
            <span><b>1</b> 基本信息 <em>{profileExists ? "已保存" : "待填写"}</em></span>
            <span><b>2</b> 求职偏好 <em>{snapshot.preferences ? "已保存" : "待填写"}</em></span>
            <span><b>3</b> 核心经历 <em>{totalFacts > 0 ? `${totalFacts} 条` : "待添加"}</em></span>
          </nav>

          <section className="resume-summary">
            <h2>简历</h2>
            {snapshot.activeResume ? (
              <p>{snapshot.activeResume.originalFileName}</p>
            ) : (
              <>
                <p>还没有上传简历</p>
                <small>你也可以先手动维护经历，之后再上传。</small>
              </>
            )}
          </section>
        </aside>

        <main className="main-column">
          <ProfileCard
            value={snapshot.profile}
            disabled={false}
            onSave={async (value) => setSnapshot(await api.saveProfile(value))}
          />
          <PreferencesCard
            value={snapshot.preferences}
            disabled={!profileExists}
            onSave={async (value) => setSnapshot(await api.savePreferences(value))}
          />
          <section className="card facts-card" aria-labelledby="facts-title">
            <div className="card-heading">
              <div>
                <p className="eyebrow">第三步</p>
                <h2 id="facts-title">核心经历</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setManualReady(true)}>添加经历</button>
            </div>
            {totalFacts === 0 && <p className="empty-copy">还没有经历事实。可以手动添加，也可以在下一步从简历中提取。</p>}
            {manualReady && <p className="inline-hint" role="status">已准备手动添加经历。</p>}
          </section>
        </main>
      </div>
    </div>
  );
}
