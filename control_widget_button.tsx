import { ControlWidget, ControlWidgetButton } from "scripting"
import { RelireWidget } from "./app_intents"






ControlWidget.present(
  <ControlWidgetButton intent={RelireWidget(undefined)} label={{ title: "Lire la boutique", systemImage: "arrow.clockwise" }} />,
)
