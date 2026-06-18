import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { adminLogin } from "@/lib/admin-session";
import { toast } from "sonner";

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const ok = await adminLogin(u, p);
    setLoading(false);
    if (ok) { toast.success("Karibu admin!"); onLogin(); }
    else toast.error("Username au password si sahihi");
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Admin Login</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Username</Label><Input value={u} onChange={(e) => setU(e.target.value)} /></div>
            <div><Label>Password</Label><Input type="password" value={p} onChange={(e) => setP(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "Ingia"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}