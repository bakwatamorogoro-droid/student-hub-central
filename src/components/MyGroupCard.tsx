import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupRosterView } from "@/components/GroupRosterView";
import { useRoster } from "@/lib/useRoster";
import { Loader2, Search, Users } from "lucide-react";

/**
 * "Group Yangu" — the student types a Reg Namba and sees the group the system
 * put them in, plus the classmates sitting with them. The roster itself is
 * rendered by `GroupRosterView`, shared with the Update Taarifa wizard.
 */
export function MyGroupCard({ initialReg = "" }: { initialReg?: string }) {
  const { loading } = useRoster();
  const [reg, setReg] = useState(initialReg);
  const [query, setQuery] = useState(initialReg);

  return (
    <Card className="border-2 border-primary/25 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Group Yangu
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Andika Reg Namba yako uone semina, group, mwakilishi, na wanafunzi ulio nao.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            placeholder="MUM2025-04-14106"
            className="flex-1 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") setQuery(reg);
            }}
          />
          <Button onClick={() => setQuery(reg)} className="font-bold">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Tafuta
          </Button>
        </div>

        {query.trim() ? <GroupRosterView reg={query} /> : null}
      </CardContent>
    </Card>
  );
}
