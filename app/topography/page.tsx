import TopoPage from "../topo/TopoPage";
import { PARAGRAPHS } from "../text";

// Contour lines draw across the page; the text sits in a clearing.
export default function Page() {
  return <TopoPage paragraphs={PARAGRAPHS} />;
}
