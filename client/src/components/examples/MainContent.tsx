import MainContent from '../MainContent'

export default function MainContentExample() {
  const handleAddToBetSlip = (selection: any) => {
    console.log("Added to bet slip:", selection);
  };

  return <MainContent onAddToBetSlip={handleAddToBetSlip} />
}