import { useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Switch } from "./components/ui/switch";
import {
	globalSkillsWorkspace,
	type SkillContent,
	type SkillState,
} from "./globalSkills";
import { displayPath, formatBytes } from "./formatters";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { CompactEmpty } from "./components/ui/compact-empty";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { cn } from "./components/ui/utils";

type ClaudeSkillsWorkspaceProps = {
	skills: SkillState;
	homeDir?: string;
	onSkillsChange: (skills: SkillState) => void;
	onError: (message: string | null) => void;
	onStatusMessage: (message: string | null) => void;
};

type DeleteSkillDialogState = {
	path: string;
	name: string;
};

export function ClaudeSkillsWorkspace({
	skills,
	homeDir,
	onSkillsChange,
	onError,
	onStatusMessage,
}: ClaudeSkillsWorkspaceProps) {
	const [query, setQuery] = useState("");
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [content, setContent] = useState<SkillContent | null>(null);
	const [deleteDialog, setDeleteDialog] =
		useState<DeleteSkillDialogState | null>(null);
	const [deleteSubmitting, setDeleteSubmitting] = useState(false);

	async function readSkill(path: string) {
		onError(null);
		onStatusMessage(null);
		setSelectedPath(path);
		setDeleteDialog(null);

		try {
			setContent(
				await invoke<SkillContent>("read_claude_skill_content", {
					path,
				}),
			);
		} catch (error) {
			onError(error instanceof Error ? error.message : String(error));
		}
	}

	async function saveSkillEnabled(path: string, enabled: boolean) {
		onError(null);
		onStatusMessage(null);
		setDeleteDialog(null);

		try {
			const result = await invoke<SkillState>("set_claude_skill_enabled", {
				path,
				enabled,
			});
			onSkillsChange(result);
			onStatusMessage(`已${enabled ? "启用" : "停用"} skill。`);
		} catch (error) {
			onError(error instanceof Error ? error.message : String(error));
		}
	}

	function requestDeleteSkill(target: DeleteSkillDialogState) {
		setDeleteSubmitting(false);
		setDeleteDialog(target);
		onError(null);
		onStatusMessage(null);
	}

	async function confirmDeleteSkill() {
		if (!deleteDialog || deleteSubmitting) {
			return;
		}

		const target = deleteDialog;

		onError(null);
		onStatusMessage(null);
		setDeleteSubmitting(true);

		try {
			const result = await invoke<SkillState>("delete_claude_skill", {
				path: target.path,
			});
			onSkillsChange(result);
			if (selectedPath === target.path) {
				setSelectedPath(null);
				setContent(null);
			}
			setDeleteDialog(null);
			onStatusMessage("已删除 skill。");
		} catch (error) {
			onError(error instanceof Error ? error.message : String(error));
		} finally {
			setDeleteSubmitting(false);
		}
	}

	return (
		<>
			<ClaudeSkillsPanel
				skills={skills}
				homeDir={homeDir}
				query={query}
				selectedPath={selectedPath}
				content={content}
				onQueryChange={setQuery}
				onSelect={readSkill}
				onSaveToggle={saveSkillEnabled}
				onDelete={requestDeleteSkill}
			/>
			<Dialog
				open={deleteDialog !== null}
				onOpenChange={(open) => !open && !deleteSubmitting && setDeleteDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>删除 skill</DialogTitle>
						<DialogDescription>
							将删除「{deleteDialog?.name ?? ""}」对应的 skill。
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button disabled={deleteSubmitting}>取消</Button>
						</DialogClose>
						<Button disabled={deleteSubmitting} variant="primary" onClick={confirmDeleteSkill}>
							{deleteSubmitting ? (
								"删除中"
							) : (
								<>
									<Trash2 data-icon="inline-start" />
									确认删除
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function ClaudeSkillsPanel({
	skills,
	homeDir,
	query,
	selectedPath,
	content,
	onQueryChange,
	onSelect,
	onSaveToggle,
	onDelete,
}: {
	skills: SkillState;
	homeDir?: string;
	query: string;
	selectedPath: string | null;
	content: SkillContent | null;
	onQueryChange: (value: string) => void;
	onSelect: (path: string) => void;
	onSaveToggle: (path: string, enabled: boolean) => void;
	onDelete: (target: DeleteSkillDialogState) => void;
}) {
	const writable = true;
	const {
		visibleSkills: skillList,
		selectedSkill,
		selectedMarkdown,
		resultLabel,
	} = globalSkillsWorkspace(skills, query, selectedPath, content);

	return (
		<section className="flex h-full min-h-0 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
			<div className="-mx-3 -mt-3 mb-3 flex min-h-12 items-center gap-[7px] border-b border-[var(--border)] p-3 max-[940px]:flex-wrap max-[940px]:items-start [&>div]:min-w-0 flex-wrap items-center [&>div]:min-w-0">
				<BookOpen size={18} />
				<div>
					<h2>全局 Skills (Claude)</h2>
				</div>
				<Badge size="count">{resultLabel}</Badge>
				<div className="ml-2 flex min-w-0 flex-[1_1_360px] flex-wrap gap-[5px]">
					{skills.roots.map((root) => (
						<Badge
							className="max-w-full break-words whitespace-normal px-2 py-[3px]"
							variant={
								!root.exists
									? "muted"
									: root.label.toLowerCase().includes("agent")
										? "success"
										: "primary"
							}
							key={root.path}
						>
							{root.label}:{" "}
							{root.exists ? displayPath(root.path, homeDir) : "未找到"}
						</Badge>
					))}
				</div>
			</div>

			<div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,0.42fr)_minmax(0,0.58fr)] gap-3 overflow-hidden max-[940px]:grid-cols-1 max-[940px]:grid-rows-[minmax(0,0.48fr)_minmax(0,0.52fr)]">
				<div className="flex min-h-0 min-w-0 flex-col gap-1.5">
					<label className="mb-2 flex min-w-0 flex-col gap-[5px] [&>span]:text-[0.74rem] [&>span]:font-semibold [&>span]:text-[var(--muted-foreground)]">
						<span>搜索全局 skills</span>
						<Input
							className="!w-full !max-w-none"
							type="search"
							value={query}
							placeholder="搜索 skill 名称、描述或路径"
							onChange={(event) => onQueryChange(event.currentTarget.value)}
						/>
					</label>
					<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-auto pr-1">
						{skillList.length === 0 ? (
							<CompactEmpty>没有发现匹配的全局 skill。</CompactEmpty>
						) : (
							skillList.map((skill) => {
								return (
									<div
										className={cn(
											"relative flex w-full min-w-0 flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--secondary)] p-3",
											skill.source.toLowerCase().includes("agent")
												? "border-[#bbf7d0] bg-[#f0fdf4]"
												: "border-[#bfdbfe] bg-[#eff6ff]",
											skill.path === selectedSkill?.path &&
												"border-[var(--primary)] shadow-[0_0_0_2px_rgba(37,99,235,0.24)]",
										)}
										key={skill.path}
										onClick={() => onSelect(skill.path)}
									>
										<div className="relative z-[0] flex min-w-0 items-start gap-2">
											<div className="min-w-0 flex-1">
												<div className="flex min-w-0 items-center gap-1">
													<Switch
														checked={skill.enabled}
														className="relative z-[2] flex-none"
														disabled={!writable}
														onClick={(event) => {
															event.stopPropagation();
														}}
														onCheckedChange={(checked) =>
															onSaveToggle(skill.path, checked)
														}
														size="sm"
													/>
													<span className="flex min-w-0 flex-1 items-center [&>strong]:text-[var(--foreground)]">
														<strong className="block min-w-0 truncate">
															{skill.name}
														</strong>
													</span>
													{skill.symlink && (
														<Badge
															className="text-[0.68rem] font-extrabold leading-none"
															variant="primary"
														>
															软链
														</Badge>
													)}
													<Badge
														className="pointer-events-none bg-[var(--card)] px-[9px] py-1 font-extrabold leading-[1.1]"
														variant="card"
													>
														{formatBytes(skill.size)}
													</Badge>
													<Button
														aria-label={`删除 skill ${skill.name}`}
														className="relative z-[2] ml-auto size-7 flex-none justify-center p-0 text-[var(--destructive)] hover:bg-[var(--destructive-soft)]"
														disabled={!writable}
														onClick={(event) => {
															event.stopPropagation();
															onDelete({ path: skill.path, name: skill.name });
														}}
														size="sm"
														title={`删除 skill ${skill.name}`}
														variant="ghost"
													>
														<Trash2 data-icon="inline-start" />
													</Button>
												</div>
												<code className="pointer-events-none relative z-[0] mt-1 block w-full">
													{displayPath(skill.path, homeDir)}
												</code>
												{skill.symlink && skill.targetDirectory && (
													<small className="pointer-events-none relative z-[0] mt-1 block w-full break-words text-[0.74rem] font-bold text-[var(--foreground)]">
														原始位置：
														{displayPath(skill.targetDirectory, homeDir)}
													</small>
												)}
											</div>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				<div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-2">
					{selectedSkill ? (
						<>
							<div className="flex min-w-0 items-start justify-between gap-2 [&_p]:mt-[3px] [&_p]:break-words [&_p]:text-[0.72rem] [&_p]:text-[var(--muted-foreground)]">
								<div>
									<h3>{selectedSkill.name}</h3>
									<p>{displayPath(selectedSkill.directory, homeDir)}</p>
									{selectedSkill.symlink && selectedSkill.targetDirectory && (
										<p className="font-semibold text-[var(--foreground)]">
											原始位置：
											{displayPath(
												selectedSkill.targetDirectory,
												homeDir,
											)}
										</p>
									)}
								</div>
							</div>
							<pre className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius)] bg-[var(--code-background)] p-2.5 text-[0.76rem] leading-[1.42] text-[var(--code-foreground)]">
								{selectedMarkdown || "选择左侧 skill 后会显示 SKILL.md 内容。"}
							</pre>
							<p className="mt-1 text-[0.8rem] text-[var(--muted-foreground)]">
								停用会把 SKILL.md 重命名为 SKILL.md.disabled。
							</p>
						</>
					) : (
						<CompactEmpty>没有可预览的 skill。</CompactEmpty>
					)}
				</div>
			</div>
		</section>
	);
}
