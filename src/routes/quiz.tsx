import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/components/ComingSoonPage";

export const Route = createFileRoute("/quiz")({
  component: AssignmentPage,
  head: () => ({
    meta: [
      { title: "Assignment — Islamic Studies Test Online" },
      {
        name: "description",
        content: "Sehemu ya Assignment inaandaliwa — itakua tayari hivi karibuni.",
      },
      { property: "og:title", content: "Assignment — Islamic Studies Test Online" },
    ],
  }),
});

function AssignmentPage() {
  return <ComingSoonPage titleKey="nav_quiz" />;
}
