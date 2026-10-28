import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { alertSuccess, alertError, confirmAction } from "@/lib/alerts";
import { Check, X, UserCog, Pencil, Trash2, Save, RefreshCw } from "lucide-react";
import { ACADEMIC_YEARS, STUDY_YEARS, SEMESTERS } from "@/lib/academicTargeting";
import { isMissingColumnError } from "@/lib/studentProfile";

export const Route = createFileRoute("/admin/requests")({ component: Page });

/** Human labels for the `changed_fields` keys written by the student form. */
const FIELD_LABELS: Record<string, string> = {
  reg_no: "Reg Namba",
  full_name: "Jina",
  semina: "Semina",
  group: "Group",
  course: "Kozi",
  study_year: "Mwaka wa Masomo",
  semester: "Semester",
};

type RequestRow = Record<string, any>;

/**
 * The fields the admin needs to compare. `new` is what the student asked for,
 * `current` is the value in the students table when the request was made.
 */
function diffRows(r: RequestRow) {
  const pairs: { key: string; label: string; from: any; to: any }[] = [
    { key: "reg_no", label: "Reg Namba", from: r.current_reg_no, to: r.new_reg_no },
    { key: "full_name", label: "Jina", from: r.current_full_name, to: r.new_full_name },
  ];
  if (r.new_semina) pairs.push({ key: "semina", label: "Semina", from: null, to: r.new_semina });
  if (r.new_student_group)
    pairs.push({ key: "group", label: "Group", from: null, to: r.new_student_group });
  if (r.new_course) pairs.push({ key: "course", label: "Kozi", from: null, to: r.new_course });
  if (r.new_study_year)
    pairs.push({ key: "study_year", label: "Mwaka", from: null, to: r.new_study_year });
  if (r.new_semester)
    pairs.push({ key: "semester", label: "Semester", from: null, to: r.new_semester });
  return pairs.filter((p) => p.to != null && String(p.to) !== String(p.from ?? ""));
}

function Page() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: s } = await supabase
      .from("app_settings")
      .select("profile_edits_enabled")
      .eq("id", 1)
      .single();
    setEnabled(!!s?.profile_edits_enabled);
    const { data } = await (supabase as any)
      .from("profile_update_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const toggleEnabled = async (v: boolean) => {
    await supabase.from("app_settings").update({ profile_edits_enabled: v }).eq("id", 1);
    setEnabled(v);
    toast.success(v ? "Update Taarifa imewashwa" : "Update Taarifa imezimwa");
  };

  const approve = async (r: RequestRow) => {
    const { error } = await (supabase as any).rpc("apply_profile_update", {
      p_student_id: r.student_id,
      p_new_reg_no: r.new_reg_no,
      p_new_full_name: r.new_full_name,
      p_new_semina: r.new_semina,
      p_new_group: r.new_student_group,
    });
    if (error) return alertError("Imeshindikana kuthibitisha", error.message);
    // The RPC only covers reg/name/semina/group; the academic columns live on the
    // students row, so write them here too.
    const acad: Record<string, unknown> = {};
    if (r.new_course) acad.course = r.new_course;
    if (r.new_study_year) acad.study_year = Number(r.new_study_year);
    if (r.new_semester) acad.semester = r.new_semester;
    if (r.new_academic_year) acad.academic_year = r.new_academic_year;
    if (Object.keys(acad).length) {
      const { error: acadErr } = await supabase
        .from("students")
        .update(acad as any)
        .eq("id", r.student_id);
      if (acadErr && !isMissingColumnError(acadErr)) {
        return alertError("Taarifa za kitaaluma hazikuhifadhiwa", acadErr.message);
      }
    }
    await (supabase as any)
      .from("profile_update_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", r.id);
    await alertSuccess(
      "Ombi limekubaliwa",
      "Marekebisho yamethibitishwa na yamesambazwa kila mahali.",
    );
    load();
  };
  const reject = async (r: RequestRow) => {
    const ok = await confirmAction(
      "Kataa ombi hili?",
      "Mwanafunzi ataliona ombi lake kama lililokataliwa.",
      "Ndiyo, kataa",
    );
    if (!ok) return;
    await (supabase as any)
      .from("profile_update_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", r.id);
    await alertSuccess(
      "Ombi limekataliwa",
      "Mwanafunzi atajulishwa kuwa ombi lake halikukubaliwa.",
    );
    load();
  };

  const startEdit = (r: RequestRow) => {
    setEditingId(r.id);
    setEditForm({
      new_reg_no: r.new_reg_no || "",
      new_full_name: r.new_full_name || "",
      new_semina: r.new_semina || "",
      new_student_group: r.new_student_group || "",
      new_course: r.new_course || "",
      new_study_year: r.new_study_year ? String(r.new_study_year) : "",
      new_semester: r.new_semester || "",
      reason: r.reason || "",
    });
  };

  const saveEdit = async (id: string) => {
    const detail: Record<string, unknown> = {
      new_reg_no: editForm.new_reg_no?.toUpperCase() || null,
      new_full_name: editForm.new_full_name || null,
      new_semina: editForm.new_semina || null,
      new_student_group: editForm.new_student_group || null,
      reason: editForm.reason || null,
    };
    const extra: Record<string, unknown> = {
      new_course: editForm.new_course || null,
      new_study_year: editForm.new_study_year ? Number(editForm.new_study_year) : null,
      new_semester: editForm.new_semester || null,
    };
    let { error } = await (supabase as any)
      .from("profile_update_requests")
      .update({ ...detail, ...extra })
      .eq("id", id);
    if (error && isMissingColumnError(error)) {
      const retry = await (supabase as any)
        .from("profile_update_requests")
        .update(detail)
        .eq("id", id);
      error = retry.error;
    }
    if (error) return alertError("Imeshindikana kuhifadhi", error.message);
    await alertSuccess("Ombi limehaririwa");
    setEditingId(null);
    load();
  };

  const del = async (id: string) => {
    if (!(await confirmAction("Futa ombi hili kabisa?", "Haitarudishwa."))) return;
    const { error } = await (supabase as any).from("profile_update_requests").delete().eq("id", id);
    if (error) return alertError("Imeshindikana kufuta", error.message);
    await alertSuccess("Ombi limefutwa");
    load();
  };

  const delAll = async () => {
    if (
      !(await confirmAction(
        `Futa MAOMBI YOTE (${rows.length})?`,
        "Haitarudishwa.",
        "Ndiyo, futa yote",
      ))
    )
      return;
    const { error } = await (supabase as any)
      .from("profile_update_requests")
      .delete()
      .not("id", "is", null);
    if (error) return alertError("Imeshindikana kufuta", error.message);
    await alertSuccess("Maombi yote yamefutwa");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" /> Maombi ya Marekebisho
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Switch checked={enabled} onCheckedChange={toggleEnabled} />
            <div className="flex-1">
              <div className="font-bold text-sm">{enabled ? "Imewashwa" : "Imezimwa"}</div>
              <div className="text-xs text-muted-foreground">
                Wanafunzi waweze kuwasilisha maombi ya marekebisho ya wasifu.
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {rows.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {rows.length} ombi{rows.length === 1 ? "" : "bi"}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={load} className="gap-1">
                    <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Onyesha
                    mpya
                  </Button>
                  <Button size="sm" variant="destructive" onClick={delAll} className="gap-1">
                    <Trash2 className="h-3 w-3" /> Futa Yote
                  </Button>
                </div>
              </div>
            )}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">Hakuna ombi bado.</p>
            )}
            {rows.map((r) => {
              const changes = diffRows(r);
              const changedKeys: string[] = Array.isArray(r.changed_fields) ? r.changed_fields : [];
              return (
                <div key={r.id} className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex justify-between items-start flex-wrap gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Sasa:</div>
                      <div className="font-bold">
                        {r.current_full_name} • {r.current_reg_no}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("sw-TZ")}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${r.status === "approved" ? "bg-green-500/15 text-green-700" : r.status === "rejected" ? "bg-red-500/15 text-red-700" : "bg-amber-500/15 text-amber-700"}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {editingId === r.id ? (
                    <div className="mt-2 space-y-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Reg mpya</Label>
                          <Input
                            value={editForm.new_reg_no}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_reg_no: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Jina jipya</Label>
                          <Input
                            value={editForm.new_full_name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_full_name: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Semina</Label>
                          <Input
                            value={editForm.new_semina}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_semina: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Group</Label>
                          <Input
                            value={editForm.new_student_group}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_student_group: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Kozi</Label>
                          <Input
                            value={editForm.new_course}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_course: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Mwaka wa Masomo</Label>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={editForm.new_study_year}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_study_year: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {STUDY_YEARS.map((y) => (
                              <option key={y} value={String(y)}>
                                Mwaka wa {y}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Semester</Label>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={editForm.new_semester}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_semester: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {SEMESTERS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Mwaka wa Kitaaluma</Label>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={editForm.new_academic_year || ""}
                            onChange={(e) =>
                              setEditForm({ ...editForm, new_academic_year: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {ACADEMIC_YEARS.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Sababu</Label>
                        <Input
                          value={editForm.reason}
                          onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(r.id)} className="gap-1">
                          <Save className="h-3 w-3" /> Hifadhi
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Ghairi
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 space-y-1 text-sm">
                        {changedKeys.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {changedKeys.map((k) => (
                              <span
                                key={k}
                                className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                              >
                                {FIELD_LABELS[k] || k}
                              </span>
                            ))}
                          </div>
                        )}
                        {changes.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Hakuna mabadiliko ya maana kwenye ombi hili.
                          </p>
                        ) : (
                          <div className="grid sm:grid-cols-2 gap-1">
                            {changes.map((c) => (
                              <div key={c.key}>
                                {c.label}:{" "}
                                {c.from ? (
                                  <span className="text-muted-foreground line-through">
                                    {c.from}
                                  </span>
                                ) : null}{" "}
                                <b className="text-primary">{c.to}</b>
                              </div>
                            ))}
                          </div>
                        )}
                        {r.reason && (
                          <div className="text-xs text-muted-foreground">Sababu: {r.reason}</div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => approve(r)} className="gap-1">
                              <Check className="h-3 w-3" /> Thibitisha
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reject(r)}
                              className="gap-1"
                            >
                              <X className="h-3 w-3" /> Kataa
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEdit(r)}
                          className="gap-1"
                        >
                          <Pencil className="h-3 w-3" /> Hariri
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => del(r.id)}
                          className="gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Futa
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
