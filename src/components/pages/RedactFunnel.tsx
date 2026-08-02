import { useNavigate } from "react-router-dom";
import UploadPage from "./UploadPage";
import ConfigurePage from "./ConfigurePage";
import type { RedactionFunnel } from "../../hooks/useRedactionFunnel";

interface RedactFunnelProps {
  funnel: RedactionFunnel;
}

export default function RedactFunnel({ funnel }: RedactFunnelProps) {
  const navigate = useNavigate();
  const { uploadedFile, options, setOptions, clearFile, handleFileSelected, handleSubmitOptions } =
    funnel;

  if (!uploadedFile) {
    return <UploadPage onBack={() => navigate("/")} onContinue={handleFileSelected} />;
  }

  return (
    <ConfigurePage
      filename={uploadedFile.file.name}
      options={options}
      onOptionsChange={setOptions}
      onBack={clearFile}
      onSubmit={handleSubmitOptions}
    />
  );
}
