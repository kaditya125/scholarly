import requests
from bs4 import BeautifulSoup

def parse_ugcnetonline():
    headers = {'User-Agent': 'Mozilla/5.0'}
    r = requests.get('https://www.ugcnetonline.in/previous_question_papers.php', headers=headers, timeout=15)
    soup = BeautifulSoup(r.text, 'html.parser')
    links = soup.find_all('a')
    print(f"Total links on ugcnetonline previous papers: {len(links)}")
    for a in links:
        href = a.get('href', '')
        text = a.get_text().strip()
        if 'computer' in text.lower() or 'paper' in text.lower() or 'question' in text.lower() or '87' in text:
            print(f"  {text} -> {href}")

def parse_syllabus():
    headers = {'User-Agent': 'Mozilla/5.0'}
    r = requests.get('https://ugcnetonline.in/syllabus-new.php', headers=headers, timeout=15)
    soup = BeautifulSoup(r.text, 'html.parser')
    for a in soup.find_all('a'):
        text = a.get_text().strip()
        href = a.get('href', '')
        if 'computer' in text.lower() or '87' in text:
            print(f"Syllabus: {text} -> {href}")

if __name__ == '__main__':
    print("--- UGCNETONLINE PREVIOUS PAPERS ---")
    parse_ugcnetonline()
    print("\n--- SYLLABUS ---")
    parse_syllabus()
