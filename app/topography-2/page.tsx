import TopoPage from "../topo/TopoPage";
import { PARAGRAPHS } from "../text";

// The topography page with its extra effects on.
export default function Page() {
  return <TopoPage paragraphs={PARAGRAPHS} fx />;
}
