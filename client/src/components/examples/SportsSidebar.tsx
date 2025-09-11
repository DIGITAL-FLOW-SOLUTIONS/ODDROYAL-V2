import SportsSidebar from '../SportsSidebar'
import { SidebarProvider } from "@/components/ui/sidebar"

export default function SportsSidebarExample() {
  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <SportsSidebar />
      </div>
    </SidebarProvider>
  )
}