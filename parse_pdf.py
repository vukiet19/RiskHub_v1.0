import sys
from pypdf import PdfReader

def extract_text(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    return text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_pdf.py <pdf_file>")
        sys.exit(1)
    
    try:
        content = extract_text(sys.argv[1])
        print(content)
    except Exception as e:
        print(f"Error: {e}")
