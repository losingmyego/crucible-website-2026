import CathedralPage from "./cathedral/CathedralPage";
import { HOME } from "./text";

// The homepage: the cathedral hero.
export default function Page() {
  return <CathedralPage paragraphs={HOME} />;
}
