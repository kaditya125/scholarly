export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_HINDI_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_HINDI_BHASHA_AUR_VIKAS',
    unitName: 'Hindi Bhasha aur Uska Vikas',
    topics: [
      'Hindi ki aitihasik prishthabhumi: Prachin Bharatiya Arya Bhashayein, Madhyakalin Bharatiya Arya Bhashayein (Pali, Prakrit, Apabhramsha aur Avahattha)',
      'Apabhramsha aur uske bhed tatha adhunik Bharatiya Arya bhashaon ka vikas',
      'Hindi ka bhougolik vistar: Hindi ki upbhashayein (Pashchimi Hindi, Purvi Hindi, Rajasthani, Bihari, Pahadi) aur unki boliyan (Braj, Awadhi, Khari Boli, Bhojpuri, Maithili)',
      'Khari Boli Hindi ka swaroop aur vyakaranik visheshtayein, dhwani vichar (swar, vyanjan), roop vichar, vakya vichar',
      'Hindi ke vividh roop: Rashtrabhasha, Rajbhasha, Sampark Bhasha, Sanchar Madhyam aur Hindi',
      'Devanagari lipi: Naamkaran, vikas, visheshtayein, manakikaran aur lipi sudhar andolan'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_HINDI_SAHITYA_KA_ITIHAS',
    unitName: 'Hindi Sahitya ka Itihas (Aadi se Adhunik Kaal)',
    topics: [
      'Hindi sahitya itihas-lekhan ki parampara aur drishtikon, kaal-vibhajan aur naamkaran',
      'Aadikaal: Siddha, Nath aur Jain sahitya, Raso kavya parampara (Prithviraj Raso, Bisaldev Raso), Amir Khusro aur Vidyapati',
      'Bhaktikaal: Bhakti andolan ke udbhav ki prishthabhumi, Sant kavya (Kabir, Raidas, Nanak), Sufi premakhyanak (Jayasi, Manjhan), Krishna bhakti (Surdas, Nanddas, Mirabai, Raskhan), Ram bhakti (Tulsidas, Keshavdas)',
      'Reetikaal: Reetikaal ki prishthabhumi, Reetibaddha (Keshav, Chintamani, Matiram, Deva, Padmakar), Reetisiddha (Bihari), Reetimukta (Ghananand, Bodha, Alam, Thakur), Reetikaalin veer kavya (Bhushan)',
      'Adhunik Kaal: Bharatendu Yug (Bharatendu Harishchandra, Pratap Narain Mishra, Balkrishna Bhatt), Dwivedi Yug (Mahavir Prasad Dwivedi, Maithili Sharan Gupt, Hariaudh), Chhayavad (Jaishankar Prasad, Suryakant Tripathi Nirala, Sumitranandan Pant, Mahadevi Varma)',
      'Pragativad (Nagarjun, Kedar Nath Agarwal, Trilochan), Prayogvad evam Nayi Kavita (Agyeya, Muktibodh, Shamsher, Bhavani Prasad Mishra, Dharamvir Bharati), Samkalin Kavita'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_SAHITYA_SHASTRA',
    unitName: 'Sahitya Shastra (Bharatiya aur Pashchatya)',
    topics: [
      'Kavya lakshana, kavya hetu, kavya prayojana',
      'Rasa siddhanta: Rasa nishpatti (Bhatta Lollata, Shankuka, Bhatta Nayaka, Abhinavagupta), Sadharanikaran, Rasa ke ang',
      'Alankara siddhanta (Bhamaha, Udbhata, Dandin, Mammata), Reeti siddhanta (Vamana), Dhwani siddhanta (Anandavardhana, Abhinavagupta)',
      'Vakrokti siddhanta (Kuntaka), Auchitya siddhanta (Kshemendra)',
      'Pashchatya Kavya Shastra: Plato (Kavya ka anukaran evam aakshep), Aristotle (Anukarana siddhanta, Tragedi, Virechana/Catharsis)',
      'Longinus (Udattata tatva/Sublime), Wordsworth (Kavya bhasha siddhanta), Coleridge (Kalpana aur lalitya)',
      'T.S. Eliot (Parampara aur vaiyaktik pragya, Nirvaiyaktikata siddhanta, Vastuparaka samakaksha/Objective Correlative), I.A. Richards (Mulya siddhanta, Sampreshaniya siddhanta)',
      'Nayi Samiksha, Uttar-Sanrachnavad, Vikhantanvad (Derrida)'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_VAICHARIK_PRISHTHABHUMI',
    unitName: 'Vaicharik Prishthabhumi',
    topics: [
      'Bhartiya Navjagran aur Hindi Navjagran (1857 ki kranti, Khari Boli andolan)',
      'Khari Boli andolan aur Hindi sahitya par uska prabhav',
      'Gandhi-vadi darshan (Satya, Ahimsa, Satyagraha, Gram Swaraj, Swadeshi)',
      'Ambedkar-vadi darshan (Samajik samata, Jati pratha ka unmoolan, Dalit chintan)',
      'Lohia-vadi darshan (Sapta Kranti, Samajvadi drishti)',
      'Marx-vadi drishti aur pragatisheel chetna',
      'Manovishleshan-vad (Freud, Adler, Jung) aur Hindi sahitya',
      'Astitvavad (Sartre, Camus, Kierkegaard) aur Adhuniktavad',
      'Asmitamulak vimarsh: Dalit vimarsh, Stri vimarsh, Adivasi vimarsh, Alpasankhyak vimarsh'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_HINDI_KAVITA',
    unitName: 'Hindi Kavita (Pathya-Kramik Kritiyan)',
    topics: [
      'Prithviraj Raso (Rewa Tat), Amir Khusro (Paheliyan, Mukariyan), Vidyapati (Padavali)',
      'Kabir (Kabir Granthavali - Pad evam Sakhi, sampadak Shyam Sundar Das), Jayasi (Padmavat - Nagmati Viyog Khand)',
      'Surdas (Bhramar-Geet Saar - sampadak Ramchandra Shukla), Tulsidas (Ramcharitmanas - Uttar Kand; Kavitavali - Uttar Kand)',
      'Bihari (Bihari Ratnakar - Jagannath Das Ratnakar), Ghananand (Ghananand Kavit - Vishwanath Prasad Mishra)',
      'Maithili Sharan Gupt (Bharat Bharati, Saket - Navam Sarg), Hariaudh (Priya Pravas)',
      'Jaishankar Prasad (Kamayani - Chinta, Shraddha, Ida sarg, Aansoo), Nirala (Ram Ki Shakti Puja, Saroj Smriti, Kukurmutta)',
      'Sumitranandan Pant (Parivartan, Nauka Vihar, Bharat Mata), Mahadevi Varma (Sandhya Geet, Deepshikha ke chuninda geet)',
      'Ramdhari Singh Dinkar (Urvashi - Tritiya Ank, Rashmirathi), Nagarjun (Kalidas, Badal Ko Ghirte Dekha Hai, Akal Aur Uske Baad)',
      'Agyeya (Asadhya Veena, Kalgi Bajre Ki, Nadi Ke Dweep), Muktibodh (Andhere Mein, Brahmarakshas), Dhumil (Mochiram, Patkatha)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_HINDI_UPANYAS',
    unitName: 'Hindi Upanyas',
    topics: [
      'Pandit Gauridutt (Devrani Jethani ki Kahani), Lala Srinivas Das (Pariksha Guru)',
      'Premchand (Sevasadan, Rangbhoomi, Godan)',
      'Agyeya (Shekhar: Ek Jivani - Bhag 1)',
      'Hazari Prasad Dwivedi (Banbhatta Ki Atmakatha)',
      'Phanishwar Nath Renu (Maila Anchal)',
      'Yashpal (Jhootha Sach - Vatan aur Desh, Desh ka Bhavishya)',
      'Amritlal Nagar (Manas Ka Hans), Bhisham Sahni (Tamas)',
      'Shrilal Shukla (Raag Darbari), Krishna Sobti (Zindaginama)',
      'Mannu Bhandari (Aapka Banti), Jagdish Chandra (Dharti Dhan Na Apna)'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_HINDI_KAHANI',
    unitName: 'Hindi Kahani',
    topics: [
      'Rajendra Bala Ghosh - Banga Mahila (Chandrakanta, Dulaiwali), Madhavrao Sapre (Ek Tokri Bhar Mitti)',
      'Subhadra Kumari Chauhan (Rahi), Chandradhar Sharma Guleri (Usne Kaha Tha)',
      'Premchand (Idgah, Kafan, Poos Ki Raat), Jaishankar Prasad (Aakashdeep, Puraskar)',
      'Jainendra Kumar (Apna Apna Bhagya, Pajeb), Phanishwar Nath Renu (Teesri Kasam, Lal Paan Ki Begum)',
      'Agyeya (Gangrene / Roj), Shekhar Joshi (Kosi Ka Ghatwar), Bhisham Sahni (Amritsar Aa Gaya Hai, Chief Ki Dawat)',
      'Krishna Sobti (Sikka Badal Gaya), Harishankar Parsai (Inspector Matadeen Chand Par), Nirmal Verma (Parinde)',
      'Kamleshwar (Raja Nirbansiya), Mohan Rakesh (Malbe Ka Malik), Gyanranjan (Pita)'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_HINDI_NATAK',
    unitName: 'Hindi Natak evam Rangmanch',
    topics: [
      'Bharatendu Harishchandra (Andher Nagari, Bharat Durdasha)',
      'Jaishankar Prasad (Chandragupta, Skandagupta, Dhruvaswamini)',
      'Dharamvir Bharati (Andha Yug)',
      'Lakshmi Narayan Mishra (Sindoor Ki Holi)',
      'Mohan Rakesh (Aashadh Ka Ek Din, Aadhe Adhure, Lahron Ke Rajhans)',
      'Habib Tanvir (Agra Bazar), Sarveshwar Dayal Saxena (Bakri)',
      'Shankar Shesh (Ek Aur Dronacharya), Upendranath Ashk (Anjo Didi)',
      'Manu Bhandari (Mahabhoj - Natya roopantar)'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_HINDI_NIBANDH',
    unitName: 'Hindi Nibandh',
    topics: [
      'Bharatendu Harishchandra (Bharatvarshonnati Kaise Ho Sakti Hai, Delhi Darbar Darpan)',
      'Pratap Narain Mishra (Shiksha, Dhokha)',
      'Balmukund Gupt (Shivshambhu Ke Chitthe)',
      'Ramchandra Shukla (Kavita Kya Hai, Bhay, Utsah, Shraddha aur Bhakti)',
      'Hazari Prasad Dwivedi (Nakhun Kyun Badhte Hain, Kutaj, Ashok Ke Phool)',
      'Vidya Niwas Mishra (Mere Ram Ka Mukut Bheeg Raha Hai)',
      'Adhyapak Purna Singh (Aacharan Ki Sabhyata, Majdoori Aur Prem)',
      'Kuber Nath Rai (Uttar Phalguni Ke Aas Paas, Priya Neelkanthi)',
      'Viveki Rai (Uth Jaag Musafir), Namwar Singh (Sanskriti Aur Saundarya)'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_ATMAKATHA_JEEVANI_GADYA',
    unitName: 'Atmakatha, Jeevani tatha Anya Gadya Vidhayen',
    topics: [
      'Ramvriksh Benipuri (Mati Ki Mooratein - Rekhachitra), Mahadevi Varma (Thakuri Baba, Mera Parivar, Ateet Ke Chalchitra)',
      'Shivrani Devi (Premchand Ghar Mein), Amrit Rai (Kalam Ka Sipahi)',
      'Harivansh Rai Bachchan (Kya Bhoolun Kya Yaad Karoon)',
      'Tulsi Ram (Murdahiya - Atmakatha), Mannu Bhandari (Ek Kahani Yeh Bhi)',
      'Vishnu Prabhakar (Awara Masiha - Sarat Chandra ki jeevani)',
      'Harishankar Parsai (Bholaram Ka Jeev - Vyangya)',
      'Krishna Sobti (Hum Hashmat), Dinkar (Sanskriti Ke Chaar Adhyay)',
      'Rahul Sankrityayan (Meri Ladakh Yatra), Agyeya (Arey Yayavar Rahega Yaad)'
    ]
  }
];

export function classifyHindiQuestion(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  
  // Unit 1: Hindi Bhasha aur Vikas
  if (lower.includes('apabhramsha') || lower.includes('apbhransh') || lower.includes('devanagari') || lower.includes('boli') || 
      lower.includes('upbhasha') || lower.includes('bhasha vigyan') || lower.includes('khari boli') || lower.includes('braj bhasha') ||
      lower.includes('awadhi') || lower.includes('dhwani') || lower.includes('swar') || lower.includes('vyanjan') ||
      lower.includes('rajbhasha') || lower.includes('rashtrabhasha') || lower.includes('lipi') || lower.includes('pali') || lower.includes('prakrit')) {
    return { unitNumber: 1, unitCode: UGC_NET_HINDI_TAXONOMY[0].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[0].unitName };
  }

  // Unit 3: Sahitya Shastra
  if (lower.includes('rasa') || lower.includes('dhwani siddhanta') || lower.includes('alankara') || lower.includes('vakrokti') ||
      lower.includes('kavya lakshana') || lower.includes('kavya hetu') || lower.includes('kavya prayojana') || lower.includes('aristotle') ||
      lower.includes('tragedi') || lower.includes('catharsis') || lower.includes('virechana') || lower.includes('coleridge') ||
      lower.includes('wordsworth') || lower.includes('i.a. richards') || lower.includes('t.s. eliot') || lower.includes('bhamaha') ||
      lower.includes('mammata') || lower.includes('anandavardhana') || lower.includes('abhinavagupta') || lower.includes('sadharanikaran')) {
    return { unitNumber: 3, unitCode: UGC_NET_HINDI_TAXONOMY[2].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[2].unitName };
  }

  // Unit 4: Vaicharik Prishthabhumi
  if (lower.includes('navjagran') || lower.includes('ambedkar') || lower.includes('gandhi') || lower.includes('lohia') ||
      lower.includes('marx') || lower.includes('manovishleshan') || lower.includes('freud') || lower.includes('astitvavad') ||
      lower.includes('dalit vimarsh') || lower.includes('stri vimarsh') || lower.includes('adivasi vimarsh')) {
    return { unitNumber: 4, unitCode: UGC_NET_HINDI_TAXONOMY[3].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[3].unitName };
  }

  // Unit 6: Hindi Upanyas
  if (lower.includes('upanyas') || lower.includes('godan') || lower.includes('maila anchal') || lower.includes('sevasadan') ||
      lower.includes('banbhatta ki atmakatha') || lower.includes('tamas') || lower.includes('raag darbari') || lower.includes('jhootha sach') ||
      lower.includes('shekhar ek jivani') || lower.includes('zindaginama') || lower.includes('aapka banti') || lower.includes('pariksha guru')) {
    return { unitNumber: 6, unitCode: UGC_NET_HINDI_TAXONOMY[5].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[5].unitName };
  }

  // Unit 7: Hindi Kahani
  if (lower.includes('kahani') || lower.includes('usne kaha tha') || lower.includes('kafan') || lower.includes('idgah') ||
      lower.includes('aakashdeep') || lower.includes('teesri kasam') || lower.includes('chief ki dawat') || lower.includes('parinde') ||
      lower.includes('sikka badal gaya') || lower.includes('ek tokri bhar mitti') || lower.includes('raja nirbansiya')) {
    return { unitNumber: 7, unitCode: UGC_NET_HINDI_TAXONOMY[6].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[6].unitName };
  }

  // Unit 8: Hindi Natak
  if (lower.includes('natak') || lower.includes('andher nagari') || lower.includes('bharat durdasha') || lower.includes('skandagupta') ||
      lower.includes('chandragupta') || lower.includes('dhruvaswamini') || lower.includes('andha yug') || lower.includes('aashadh ka ek din') ||
      lower.includes('aadhe adhure') || lower.includes('lahron ke rajhans') || lower.includes('agra bazar') || lower.includes('bakri')) {
    return { unitNumber: 8, unitCode: UGC_NET_HINDI_TAXONOMY[7].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[7].unitName };
  }

  // Unit 9: Hindi Nibandh
  if (lower.includes('nibandh') || lower.includes('kavita kya hai') || lower.includes('nakhun kyun badhte hain') || lower.includes('kutaj') ||
      lower.includes('shivshambhu ke chitthe') || lower.includes('ashok ke phool') || lower.includes('mere ram ka mukut bheeg raha hai') ||
      lower.includes('aacharan ki sabhyata') || lower.includes('majdoori aur prem')) {
    return { unitNumber: 9, unitCode: UGC_NET_HINDI_TAXONOMY[8].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[8].unitName };
  }

  // Unit 10: Atmakatha, Jeevani tatha Anya Gadya
  if (lower.includes('atmakatha') || lower.includes('jeevani') || lower.includes('rekhachitra') || lower.includes('sansmaran') ||
      lower.includes('murdahiya') || lower.includes('awara masiha') || lower.includes('kalam ka sipahi') || lower.includes('kya bhoolun kya yaad karoon') ||
      lower.includes('mati ki mooratein') || lower.includes('bholaram ka jeev') || lower.includes('sanskriti ke chaar adhyay') || lower.includes('yatra')) {
    return { unitNumber: 10, unitCode: UGC_NET_HINDI_TAXONOMY[9].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[9].unitName };
  }

  // Unit 5: Hindi Kavita
  if (lower.includes('prithviraj raso') || lower.includes('khusro') || lower.includes('vidyapati') || lower.includes('kabir') ||
      lower.includes('jayasi') || lower.includes('padmavat') || lower.includes('surdas') || lower.includes('bhramar geet') ||
      lower.includes('tulsidas') || lower.includes('ramcharitmanas') || lower.includes('kavitavali') || lower.includes('bihari') ||
      lower.includes('ghananand') || lower.includes('kamayani') || lower.includes('ram ki shakti puja') || lower.includes('saroj smriti') ||
      lower.includes('urvashi') || lower.includes('andhere mein') || lower.includes('asadhya veena') || lower.includes('kavita') || lower.includes('pad') || lower.includes('doha')) {
    return { unitNumber: 5, unitCode: UGC_NET_HINDI_TAXONOMY[4].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[4].unitName };
  }

  // Unit 2: Default to Hindi Sahitya ka Itihas
  return { unitNumber: 2, unitCode: UGC_NET_HINDI_TAXONOMY[1].unitCode, unitName: UGC_NET_HINDI_TAXONOMY[1].unitName };
}
