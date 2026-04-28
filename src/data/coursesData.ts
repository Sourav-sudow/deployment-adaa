export const coursesData = {
  BCA: {
    name: "Bachelor of Computer Applications",
    years: {
      "1st Year": {
        subjects: {
          DBMS: {
            name: "Database Management System",
            topics: [
              { title: "Normalization" },
              {
                title: "SQL",
                narration:
                  "In this lesson, we will learn SQL, which stands for Structured Query Language. SQL is used to store, retrieve, and manage data in databases. By the end of this lesson, you will understand how to write basic SQL queries and work with databases confidently."
              },
              { title: "ER Diagram" },
              { title: "Transactions" },
              { title: "Indexing" }
            ]
          },
          DS: {
            name: "Data Structures",
            topics: ["Arrays", "Linked Lists", "Trees", "Graphs", "Sorting Algorithms"]
          }
        }
      },
      "2nd Year": {
        subjects: {
          OS: {
            name: "Operating System",
            topics: ["Process Management", "Memory Management", "File Systems", "Deadlock", "Synchronization"]
          },
          WebDev: {
            name: "Web Development",
            topics: ["HTML/CSS", "JavaScript", "React", "Node.js", "MongoDB"]
          }
        }
      },
      "3rd Year": {
        subjects: {
          ML: {
            name: "Machine Learning",
            topics: ["Linear Regression", "Decision Trees", "Neural Networks", "NLP", "Computer Vision"]
          },
          CloudComputing: {
            name: "Cloud Computing",
            topics: ["AWS", "Azure", "GCP", "Containers", "Kubernetes"]
          }
        }
      },
      "6th Semester": {
        subjects: {
          "Cloud Computing": {
            name: "Cloud Computing",
            topics: [
              { title: "Cloud Basics" },
              { title: "Virtualization" },
              { title: "IaaS PaaS SaaS" },
              { title: "Kubernetes Essentials" },
              { title: "Serverless" }
            ]
          },
          "AI & ML": {
            name: "Artificial Intelligence & Machine Learning",
            topics: [
              { title: "AI Fundamentals" },
              { title: "Supervised Learning" },
              { title: "Unsupervised Learning" },
              { title: "Neural Networks Intro" },
              { title: "Model Evaluation" }
            ]
          },
          "Cyber Security": {
            name: "Cyber Security",
            topics: [
              { title: "Security Basics" },
              { title: "Network Security" },
              { title: "Cryptography" },
              { title: "Web App Security" },
              { title: "Incident Response" }
            ]
          },
          "Big Data & Analytics": {
            name: "Big Data & Analytics",
            topics: [
              { title: "Big Data Overview" },
              { title: "Hadoop Intro" },
              { title: "Spark Basics" },
              { title: "Data Warehousing" },
              { title: "Data Visualization" }
            ]
          },
          "Introduction to Computer Networks": {
            name: "Introduction to Computer Networks",
            units: [
              {
                title: "Unit 1 – Foundations of Computer Networks",
                topics: [
                  "Introduction to Computer Networks",
                  "Network Topologies",
                  "OSI Model",
                  "TCP/IP Model",
                  "Data Transmission Concepts",
                  "Network Devices",
                  "Transmission Media"
                ]
              },
              {
                title: "Unit 2 – Data Link Layer & Network Layer Fundamentals",
                topics: [
                  "Framing & Error Detection",
                  "Ethernet & MAC Addressing",
                  "Switches & VLANs",
                  "ARP & IP Addressing",
                  "Subnetting & CIDR",
                  "ICMP & Diagnostics"
                ]
              },
              {
                title: "Unit 3 – Network Layer Routing & Transport Layer",
                topics: [
                  "Static vs Dynamic Routing",
                  "RIP & OSPF (basics)",
                  "NAT & Port Forwarding",
                  "TCP vs UDP",
                  "Flow Control & Congestion Control",
                  "Ports & Sockets"
                ]
              },
              {
                title: "Unit 4 – Application Layer & Network Utilities",
                topics: [
                  "DNS Basics",
                  "HTTP/HTTPS",
                  "Email Protocols (SMTP/IMAP/POP3)",
                  "FTP vs SFTP",
                  "DHCP & IP Allocation",
                  "Network Utilities (ping, traceroute)"
                ]
              }
            ],
            topics: [
              {
                title: "Introduction to Computer Networks",
                narration:
                  "What a network is, how hosts exchange data in packets, and the role of bandwidth, latency, and reliability in modern communication."
              },
              {
                title: "Network Topologies",
                narration: "Common physical and logical layouts (bus, ring, star, mesh) and when each is used."
              },
              {
                title: "OSI Model",
                narration: "Seven-layer reference model, service interfaces, and how data moves down and up the stack."
              },
              {
                title: "TCP/IP Model",
                narration: "Four-layer practical model, encapsulation, decapsulation, and protocol placement."
              },
              {
                title: "Data Transmission Concepts",
                narration: "Signals, bandwidth vs throughput, noise, and how bits are encoded on the wire."
              },
              {
                title: "Network Devices",
                narration: "Roles of hubs, switches, routers, access points, and how they forward frames or packets."
              },
              {
                title: "Transmission Media",
                narration: "Copper, fiber, and wireless channels along with when to choose each medium."
              },
              {
                title: "Framing & Error Detection",
                narration: "How data link frames are delimited and protected with parity, checksums, and CRC."
              },
              {
                title: "Ethernet & MAC Addressing",
                narration: "Ethernet frame format, MAC addressing, and collision handling in modern switched LANs."
              },
              {
                title: "Switches & VLANs",
                narration: "Learning MAC tables, segmenting broadcast domains, and tagging traffic with VLAN IDs."
              },
              {
                title: "ARP & IP Addressing",
                narration: "Mapping IP to MAC, ARP cache behavior, and IPv4 addressing basics."
              },
              {
                title: "Subnetting & CIDR",
                narration: "Classless addressing, calculating subnets, and choosing prefix lengths for networks."
              },
              {
                title: "ICMP & Diagnostics",
                narration: "How ping and traceroute use ICMP for reachability, latency checks, and path discovery."
              },
              {
                title: "Static vs Dynamic Routing",
                narration: "Tradeoffs between manually defined routes and protocol-learned paths."
              },
              {
                title: "RIP & OSPF (basics)",
                narration: "Distance-vector vs link-state ideas using RIP timers and OSPF areas at a high level."
              },
              {
                title: "NAT & Port Forwarding",
                narration: "How private addresses are translated, PAT, and exposing internal services safely."
              },
              {
                title: "TCP vs UDP",
                narration: "Connection-oriented vs connectionless delivery, reliability, ordering, and when to choose each."
              },
              {
                title: "Flow Control & Congestion Control",
                narration: "Sliding windows, ACKs, slow start, and how TCP adapts to network load."
              },
              {
                title: "Ports & Sockets",
                narration: "Well-known ports, ephemeral ports, and how applications bind and listen for traffic."
              },
              {
                title: "DNS Basics",
                narration: "Name resolution flow from root to TLD to authoritative servers and local caching."
              },
              {
                title: "HTTP/HTTPS",
                narration: "Request/response model, methods, status codes, TLS handshakes, and secure transport."
              },
              {
                title: "Email Protocols (SMTP/IMAP/POP3)",
                narration: "How SMTP pushes mail, IMAP/POP3 retrieve messages, and where encryption fits."
              },
              {
                title: "FTP vs SFTP",
                narration: "Contrasting plain FTP control/data channels with SSH-based secure file transfer."
              },
              {
                title: "DHCP & IP Allocation",
                narration: "Discover, Offer, Request, Ack flow, lease timers, and reserving addresses."
              },
              {
                title: "Network Utilities (ping, traceroute)",
                narration: "Hands-on tools to validate reachability, latency, and routing paths during troubleshooting."
              }
            ]
          },
          "Mobile App Development": {
            name: "Mobile App Development",
            topics: [
              { title: "Android Basics" },
              { title: "Flutter Intro" },
              { title: "iOS SwiftUI Basics" },
              { title: "State Management" },
              { title: "Publishing Apps" }
            ]
          },
          "Generative Models and Applications": {
            name: "Generative Models and Applications",
            units: [
              {
                title: "Unit 1 – Understanding Generative AI",
                topics: [
                  "What is Generative AI",
                  "Traditional AI vs Generative AI",
                  "Generative Model Types (GANs, Transformers, Diffusion Models)",
                  "Real-world GenAI use cases (chatbots, art generation, content creation)",
                  "GenAI ecosystem (OpenAI, Stability AI, Hugging Face, Midjourney)",
                  "Ethics in Generative AI"
                ]
              },
              {
                title: "Unit 2 – Practical Text Generation with LLMs",
                topics: [
                  "What are Large Language Models (LLMs)",
                  "GPT, Claude and Gemini overview",
                  "Prompt Engineering Fundamentals",
                  "Prompt types (zero-shot, one-shot, few-shot)",
                  "Using APIs for text generation (OpenAI / Google / Hugging Face)",
                  "Text generation use cases (summarization, blog writing, Q&A)",
                  "Ethical concerns in text generation"
                ]
              },
              {
                title: "Unit 3 – Practical Image and Multimedia Generation",
                topics: [
                  "Image generation models (Stable Diffusion, DALL-E, Midjourney)",
                  "Text-to-image generation",
                  "Prompt strategies for image generation",
                  "AI tools for image generation (Runway ML, Canva AI, Stable Diffusion)",
                  "Multimedia AI generation (audio, video, code)",
                  "Ethics of AI-generated media"
                ]
              },
              {
                title: "Unit 4 – Applying and Evaluating Generative AI",
                topics: [
                  "Evaluating AI output quality (fluency, realism, coherence)",
                  "Evaluation metrics (BLEU, CLIPScore)",
                  "Building GenAI applications",
                  "Project ideas using Generative AI (chatbot, generator tools)",
                  "Deploying AI applications using cloud",
                  "Ethical and legal challenges in Generative AI"
                ]
              }
            ],
            topics: [
              {
                title: "What is Generative AI",
                narration: "This lesson introduces generative AI, how models learn data distributions, and the kinds of content they can synthesize like text, images, and audio."
              },
              {
                title: "Traditional AI vs Generative AI",
                narration: "Comparing discriminative models that classify data with generative models that create new data samples."
              },
              {
                title: "Generative Model Types (GANs, Transformers, Diffusion Models)",
                narration: "Overview of the three main architectures powering modern generative AI systems."
              },
              {
                title: "Real-world GenAI use cases (chatbots, art generation, content creation)",
                narration: "Exploring practical applications of generative AI in chatbots, digital art, and automated content creation."
              },
              {
                title: "GenAI ecosystem (OpenAI, Stability AI, Hugging Face, Midjourney)",
                narration: "Understanding the major players and platforms in the generative AI landscape."
              },
              {
                title: "Ethics in Generative AI",
                narration: "Discussing bias, misinformation, copyright concerns, and responsible use of generative AI."
              },
              {
                title: "What are Large Language Models (LLMs)",
                narration: "Understanding transformer-based models trained on massive text corpora to understand and generate human language."
              },
              {
                title: "GPT, Claude and Gemini overview",
                narration: "Comparing the leading large language models from OpenAI, Anthropic, and Google."
              },
              {
                title: "Prompt Engineering Fundamentals",
                narration: "Learning how to craft effective prompts to get the best results from language models."
              },
              {
                title: "Prompt types (zero-shot, one-shot, few-shot)",
                narration: "Understanding different prompting strategies and when to use each approach."
              },
              {
                title: "Using APIs for text generation (OpenAI / Google / Hugging Face)",
                narration: "Hands-on guide to integrating LLM APIs into your applications."
              },
              {
                title: "Text generation use cases (summarization, blog writing, Q&A)",
                narration: "Practical applications of text generation for summarization, content creation, and question answering."
              },
              {
                title: "Ethical concerns in text generation",
                narration: "Addressing plagiarism, misinformation, and responsible use of AI-generated text."
              },
              {
                title: "Image generation models (Stable Diffusion, DALL-E, Midjourney)",
                narration: "Overview of the leading image generation models and their capabilities."
              },
              {
                title: "Text-to-image generation",
                narration: "How diffusion models convert text descriptions into photorealistic images."
              },
              {
                title: "Prompt strategies for image generation",
                narration: "Crafting effective prompts for better image generation results including style, composition, and detail."
              },
              {
                title: "AI tools for image generation (Runway ML, Canva AI, Stable Diffusion)",
                narration: "Exploring user-friendly tools and platforms for AI image generation."
              },
              {
                title: "Multimedia AI generation (audio, video, code)",
                narration: "Extending generative AI beyond images to audio synthesis, video generation, and code completion."
              },
              {
                title: "Ethics of AI-generated media",
                narration: "Discussing deepfakes, copyright issues, and responsible use of AI-generated multimedia."
              },
              {
                title: "Evaluating AI output quality (fluency, realism, coherence)",
                narration: "Methods to assess the quality of AI-generated content across different modalities."
              },
              {
                title: "Evaluation metrics (BLEU, CLIPScore)",
                narration: "Understanding quantitative metrics used to evaluate text and image generation quality."
              },
              {
                title: "Building GenAI applications",
                narration: "Architecture patterns and best practices for building production-ready generative AI applications."
              },
              {
                title: "Project ideas using Generative AI (chatbot, generator tools)",
                narration: "Inspiring project ideas to apply your generative AI knowledge in practical applications."
              },
              {
                title: "Deploying AI applications using cloud",
                narration: "Deploying generative AI models on cloud platforms with scalability and cost considerations."
              },
              {
                title: "Ethical and legal challenges in Generative AI",
                narration: "Navigating the legal landscape including copyright, liability, and regulatory compliance."
              }
            ]
          }
        }
      }
    }
  },
  BTech: {
    name: "Bachelor of Technology",
    years: {
      "1st Year": {
        subjects: {
          "Data Structures": {
            name: "Data Structures",
            topics: ["Arrays", "Linked Lists", "Trees", "Graphs", "Sorting Algorithms"]
          },
          "Mathematics": {
            name: "Discrete Mathematics",
            topics: ["Set Theory", "Logic", "Graph Theory", "Combinatorics", "Recurrence Relations"]
          }
        }
      },
      "2nd Year": {
        subjects: {
          "Algorithms": {
            name: "Design & Analysis of Algorithms",
            topics: ["Divide & Conquer", "Dynamic Programming", "Greedy Algorithms", "NP Completeness", "Complexity Analysis"]
          },
          "Database": {
            name: "Database Systems",
            topics: ["Relational Model", "SQL", "Normalization", "Indexing", "Query Optimization"]
          }
        }
      },
      "3rd Year": {
        subjects: {
          "AI": {
            name: "Artificial Intelligence",
            topics: ["Search Algorithms", "Expert Systems", "Robotics", "Natural Language Processing", "Computer Vision"]
          },
          "SoftwareEngineering": {
            name: "Software Engineering",
            topics: ["SDLC", "Design Patterns", "Testing", "DevOps", "Agile Methodology"]
          }
        }
      }
    }
  },
  MCA: {
    name: "Master of Computer Applications",
    years: {
      "1st Year": {
        subjects: {
          "Advanced DBMS": {
            name: "Advanced Database Management System",
            topics: ["Query Optimization", "Transaction Management", "Distributed Databases", "NoSQL", "Data Warehousing"]
          },
          "AdvancedOS": {
            name: "Advanced Operating System",
            topics: ["Kernel Architecture", "Process Scheduling", "Memory Management", "I/O Systems", "Security"]
          }
        }
      },
      "2nd Year": {
        subjects: {
          "ML": {
            name: "Machine Learning",
            topics: ["Supervised Learning", "Unsupervised Learning", "Reinforcement Learning", "Deep Learning", "NLP"]
          },
          "WebServices": {
            name: "Web Services & SOA",
            topics: ["REST APIs", "SOAP", "Microservices", "Docker", "API Gateway"]
          }
        }
      },
      "3rd Year": {
        subjects: {
          "ResearchMethodology": {
            name: "Research Methodology",
            topics: ["Research Design", "Data Collection", "Statistical Analysis", "Paper Writing", "Presentation Skills"]
          },
          "AdvancedAI": {
            name: "Advanced AI & Robotics",
            topics: ["Deep Neural Networks", "Autonomous Systems", "Computer Vision", "Sensor Technology", "Embedded AI"]
          }
        }
      }
    }
  }
};

export type Course = keyof typeof coursesData;
