import { useState, type ChangeEvent } from "react";
import type { OnboardingSnapshot, ResumeUploadSummary } from "@campus-job-agent/contracts";
import type { OnboardingApi } from "../api";

const MAX_BYTES = 10 * 1024 * 1024;
const RETRYABLE = new Set(["resume_parse_failed", "resume_text_empty", "extraction_failed", "extraction_output_invalid", "interrupted"]);

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "简历操作失败";
}

function status(resume: ResumeUploadSummary): string {
  if (resume.parseStatus === "parsing") return "正在解析";
  if (resume.extractionStatus === "queued") return "已排队";
  if (resume.extractionStatus === "extracting") return "正在进行 AI 提取";
  if (resume.extractionStatus === "awaiting_confirmation") return "等待确认候选事实";
  if (resume.extractionStatus === "completed") return "已完成";
  if (resume.extractionStatus === "failed") {
    const labels: Record<string, string> = {
      resume_parse_failed: "简历解析失败",
      resume_text_empty: "简历中没有可提取的文本",
      extraction_failed: "AI 提取失败",
      extraction_output_invalid: "AI 返回的事实格式无效",
      interrupted: "上次处理被中断",
    };
    return resume.failureCode ? labels[resume.failureCode] ?? "处理失败" : "处理失败";
  }
  if (resume.parseStatus === "parsed") return "解析完成";
  return "待解析";
}

export interface ResumePanelProps {
  activeResume: ResumeUploadSummary | null;
  profileExists: boolean;
  api: OnboardingApi;
  onSnapshot: (snapshot: OnboardingSnapshot) => void;
  onRefresh: () => Promise<void>;
}

export function ResumePanel({ activeResume, profileExists, api, onSnapshot, onRefresh }: ResumePanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.toLowerCase().match(/\.(pdf|docx)$/)?.[1];
    if (!extension) {
      setError("仅支持 PDF 或 DOCX 简历");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("简历文件不能超过 10 MiB");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onSnapshot(await api.uploadResume(file));
      setAcknowledged(false);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const run = async (kind: "extract" | "retry") => {
    if (!activeResume) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "extract") await api.extractResume(activeResume.id);
      else await api.retryResume(activeResume.id);
      await onRefresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!activeResume) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteResume(activeResume.id);
      setAcknowledged(false);
      await onRefresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const canRetry = Boolean(activeResume?.failureCode && RETRYABLE.has(activeResume.failureCode));
  return (
    <section className="card resume-panel" aria-labelledby="resume-panel-title">
      <div className="card-heading">
        <div><p className="eyebrow">简历辅助</p><h2 id="resume-panel-title">上传与 AI 提取</h2></div>
        {activeResume && <span className="status-badge" aria-live="polite">{status(activeResume)}</span>}
      </div>
      {!profileExists && <p className="inline-hint">请先保存姓名或称呼，再上传简历。</p>}
      <div className="resume-actions">
        <label className="file-button">
          {activeResume ? "替换简历" : "上传简历"}
          <input
            type="file"
            aria-label="上传简历"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={!profileExists || busy}
            onChange={(event) => { void upload(event); }}
          />
        </label>
        {activeResume && <button type="button" className="danger-button" disabled={busy} onClick={() => { void remove(); }}>删除简历</button>}
      </div>
      {activeResume && (
        <div className="resume-detail">
          <strong>{activeResume.originalFileName}</strong>
          <small>{Math.ceil(activeResume.byteSize / 1024)} KiB · {activeResume.kind.toUpperCase()}</small>
          {activeResume.failureCode === "extraction_failed" && <p className="recovery-hint">可在终端运行 <code>codex login status</code> 检查登录状态</p>}
        </div>
      )}
      <label className="consent-row" id="resume-consent-help">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy || !activeResume} />
        我了解脱敏后的简历文本会发送给所选 AI 提供方处理
      </label>
      <div className="form-actions">
        {activeResume?.extractionStatus === "not_started" && (
          <button type="button" disabled={!acknowledged || busy} aria-describedby="resume-consent-help" onClick={() => { void run("extract"); }}>开始 AI 提取</button>
        )}
        {canRetry && <button type="button" disabled={busy} onClick={() => { void run("retry"); }}>重试 AI 提取</button>}
        {busy && <span role="status">正在处理…</span>}
        {error && <span role="alert">{error}</span>}
      </div>
    </section>
  );
}
