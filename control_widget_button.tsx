import { ControlWidget, ControlWidgetButton } from "scripting"
import { RelireWidget } from "./app_intents"
import { installerTraduction, langueDe, traduire } from "./langue"
import { preferencesGardees } from "./preferences"







const presenter = () => ControlWidget.present(
  <ControlWidgetButton intent={RelireWidget(undefined)} label={{ title: traduire("Lire la boutique"), systemImage: "arrow.clockwise" }} />,
)
{
  let l: "fr" | "en" = "fr"
  try { l = langueDe(preferencesGardees().langue, Device.systemLanguageCode) } catch { /* français */ }
  if (l === "fr") presenter()
  else installerTraduction(l).then(presenter, presenter)
}
