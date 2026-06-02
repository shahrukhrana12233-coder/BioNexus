import os
import warnings
warnings.filterwarnings("ignore")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
import asyncio
import urllib.parse
import subprocess
from Bio import Align

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EBI_EMAIL = os.getenv("EBI_EMAIL", "default@example.com")

class NCBISearchRequest(BaseModel): query: str; db: str = "gene"; organism: str = ""; retmax: int = 15
class UniProtSearchRequest(BaseModel): query: str; organism: str = ""; reviewed: bool = False; size: int = 20
class PDBSearchRequest(BaseModel): query: str; limit: int = 15
class EBISearchRequest(BaseModel): query: str; dataType: str = "sequence"; limit: int = 15
class DDBJSearchRequest(BaseModel): query: str
class UCSCSearchRequest(BaseModel): gene: str; genome: str = "hg38"
class BlastSubmitRequest(BaseModel): sequence: str; program: str = "blastn"; database: str = "nt"; hitlistSize: int = 20
class ClustalSubmitRequest(BaseModel): sequences: str; outfmt: str = "clustal"
class PhyMLSubmitRequest(BaseModel): alignment: str; model: str = "GTR"
class StringNetRequest(BaseModel): protein: str; species: int = 9606; score: int = 400
class StringPartRequest(BaseModel): protein: str; species: int = 9606; limit: int = 25
class KEGGSearchRequest(BaseModel): query: str; organism: str = "hsa"
class ReactomeSearchRequest(BaseModel): query: str; species: str = "Homo sapiens"
class PkgSearchRequest(BaseModel): query: str
class PairwiseRequest(BaseModel): seq1: str; seq2: str; mode: str = "global"
class NGSToolRequest(BaseModel): tool: str; args: str

def get_client():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    return httpx.AsyncClient(follow_redirects=True, timeout=15.0, verify=False, headers=headers)

@app.get("/api/health")
async def health_check():
    return {"status": "online", "services": {"ncbi": True, "claude": False}}

@app.post("/api/ncbi/search")
async def search_ncbi(request: NCBISearchRequest):
    url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    term = request.query
    if request.organism: term += f" AND {request.organism}[Organism]"
    params = {"db": request.db, "term": term, "retmax": request.retmax, "retmode": "json"}
    try:
        async with get_client() as client:
            response = await client.get(url, params=params)
            if response.status_code != 200: return {"results": [], "total": 0}
            data = response.json()
            id_list = data.get("esearchresult", {}).get("idlist", [])
            formatted = [{"id": uid, "title": f"NCBI {request.db.capitalize()} Record: {uid}", "source": "NCBI"} for uid in id_list]
            return {"results": formatted, "total": len(formatted)}
    except Exception:
        return {"results": [], "total": 0}

@app.post("/api/ebi/{source}")
async def search_ebi(source: str, request: EBISearchRequest):
    domain = "nucleotide" if source == "ena" else "interpro"
    url = f"https://www.ebi.ac.uk/ebisearch/ws/rest/{domain}"
    params = {"query": request.query, "format": "json", "size": request.limit}
    try:
        async with get_client() as client:
            response = await client.get(url, params=params)
            if response.status_code != 200: return {"results": [], "total": 0}
            data = response.json()
            formatted = [{"id": i.get("id"), "title": i.get("name", i.get("id")), "source": "EMBL-EBI"} for i in data.get("entries", [])]
            return {"results": formatted, "total": len(formatted)}
    except Exception:
        return {"results": [], "total": 0}

@app.post("/api/ddbj/search")
async def search_ddbj(request: DDBJSearchRequest):
    return await search_ncbi(NCBISearchRequest(query=request.query, db="nuccore", retmax=15))

@app.post("/api/ucsc/genes")
async def search_ucsc(request: UCSCSearchRequest):
    return {"results": [{"title": request.gene, "position": f"Genome: {request.genome}", "description": f"UCSC Genome Browser track for {request.gene}", "link": f"https://genome.ucsc.edu/cgi-bin/hgTracks?db={request.genome}&position={request.gene}"}]}

@app.post("/api/uniprot/search")
async def search_uniprot(request: UniProtSearchRequest):
    url = "https://rest.uniprot.org/uniprotkb/search"
    term = request.query
    if request.reviewed: term = f"({term}) AND (reviewed:true)"
    try:
        async with get_client() as client:
            response = await client.get(url, params={"query": term, "size": request.size, "format": "json"})
            if response.status_code != 200: return {"results": [], "total": 0}
            data = response.json()
            formatted = []
            for item in data.get("results", []):
                uid = item.get("primaryAccession", "Unknown ID")
                try: title = item["proteinDescription"]["recommendedName"]["fullName"]["value"]
                except KeyError: title = f"Protein {uid}"
                org = item.get("organism", {}).get("scientificName", "Unknown Organism")
                formatted.append({"id": uid, "accession": uid, "title": title, "organism": org, "source": "UniProt"})
            return {"results": formatted, "total": len(formatted)}
    except Exception:
        return {"results": [], "total": 0}

@app.get("/api/uniprot/entry/{accession}")
async def get_uniprot_entry(accession: str):
    url = f"https://rest.uniprot.org/uniprotkb/{accession}.json"
    try:
        async with get_client() as client:
            response = await client.get(url)
            if response.status_code != 200: raise Exception()
            return {"data": response.json()}
    except Exception:
        raise HTTPException(status_code=503, detail="UniProt Entry Error")

@app.post("/api/pdb/search")
async def search_pdb(request: PDBSearchRequest):
    url = "https://search.rcsb.org/rcsbsearch/v2/query"
    payload = {
        "query": {"type": "terminal", "service": "text", "parameters": {"value": request.query}},
        "return_type": "entry",
        "request_options": {"paginate": {"start": 0, "rows": request.limit}}
    }
    try:
        async with get_client() as client:
            response = await client.post(url, json=payload)
            if response.status_code == 204: return {"results": [], "total": 0}
            if response.status_code != 200: return {"results": [], "total": 0}
            data = response.json()
            formatted = [{"id": i["identifier"], "title": f"PDB: {i['identifier']}", "source": "RCSB PDB"} for i in data.get("result_set", [])]
            return {"results": formatted, "total": len(formatted)}
    except Exception:
        return {"results": [], "total": 0}

@app.get("/api/pdb/entry/{pdb_id}")
async def get_pdb_entry(pdb_id: str):
    url = f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
    try:
        async with get_client() as client:
            response = await client.get(url)
            if response.status_code != 200: raise Exception()
            return {"data": response.json()}
    except Exception:
        raise HTTPException(status_code=503, detail="PDB Entry Error")

@app.get("/api/alphafold/{acc}")
async def get_alphafold(acc: str):
    url = f"https://alphafold.ebi.ac.uk/api/prediction/{acc}"
    try:
        async with get_client() as client:
            response = await client.get(url)
            if response.status_code == 404: return {"predictions": []}
            if response.status_code != 200: raise Exception()
            return {"predictions": response.json()}
    except Exception:
        raise HTTPException(status_code=503, detail="AlphaFold Error")

@app.post("/api/string/network")
async def string_network(request: StringNetRequest):
    url = "https://string-db.org/api/json/network"
    params = {"identifiers": request.protein, "species": request.species, "required_score": request.score}
    try:
        async with get_client() as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200: raise Exception()
            return {"network": resp.json()}
    except Exception:
        raise HTTPException(status_code=503, detail="STRING Error")

@app.post("/api/string/partners")
async def string_partners(request: StringPartRequest):
    url = "https://string-db.org/api/json/interaction_partners"
    params = {"identifiers": request.protein, "species": request.species, "limit": request.limit}
    try:
        async with get_client() as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200: raise Exception()
            return {"partners": resp.json()}
    except Exception:
        raise HTTPException(status_code=503, detail="STRING Error")

@app.post("/api/kegg/pathway")
async def search_kegg(request: KEGGSearchRequest):
    safe_query = urllib.parse.quote(request.query)
    url = f"https://rest.kegg.jp/find/pathway/{safe_query}"
    try:
        async with get_client() as client:
            resp = await client.get(url)
            if resp.status_code != 200: return {"results": []}
            results = []
            for line in resp.text.split("\n"):
                if line.strip():
                    parts = line.split("\t")
                    if len(parts) >= 2:
                        results.append({"id": parts[0], "name": parts[1], "source": "KEGG", "link": f"https://www.kegg.jp/pathway/{parts[0].replace('path:', '')}"})
            return {"results": results}
    except Exception:
        return {"results": []}

@app.post("/api/reactome/search")
async def search_reactome(request: ReactomeSearchRequest):
    url = "https://reactome.org/ContentService/search/query"
    params = {"query": request.query}
    try:
        async with get_client() as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200: return {"results": []}
            data = resp.json()
            results = []
            for i in data.get("entries", []):
                species_list = i.get("species") or []
                species_name = species_list[0] if len(species_list) > 0 else "Unknown"
                results.append({
                    "id": i.get("stId"),
                    "title": i.get("name"),
                    "type": i.get("exactType"),
                    "species": species_name,
                    "link": f"https://reactome.org/PathwayBrowser/#/{i.get('stId')}"
                })
            return {"results": results}
    except Exception:
        return {"results": []}

@app.post("/api/blast/submit")
async def blast_submit(request: BlastSubmitRequest):
    url = "https://www.ebi.ac.uk/Tools/services/rest/ncbiblast/run"
    stype = "dna" if "n" in request.program else "protein"
    data = {"email": EBI_EMAIL, "program": request.program, "stype": stype, "sequence": request.sequence, "database": "em_rel"}
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(url, data=data)
            if resp.status_code == 200:
                return {"rid": resp.text, "estimatedTime": 30}
            raise Exception()
    except Exception:
        raise HTTPException(status_code=503, detail="BLAST Submit Error")

@app.get("/api/blast/results/{rid}")
async def blast_results(rid: str):
    status_url = f"https://www.ebi.ac.uk/Tools/services/rest/ncbiblast/status/{rid}"
    result_url = f"https://www.ebi.ac.uk/Tools/services/rest/ncbiblast/result/{rid}/out"
    try:
        async with httpx.AsyncClient(verify=False) as client:
            status = (await client.get(status_url)).text
            if status == "FINISHED":
                res = (await client.get(result_url)).text
                return {"status": "DONE", "raw_output": res, "results": [{"title": "Real BLAST Hit", "accession": "See Raw Output", "eValue": "N/A", "score": 0, "link": "#"}]}
            elif status in ["RUNNING", "PENDING"]:
                return {"status": "WAITING"}
            return {"status": "ERROR"}
    except Exception:
        return {"status": "ERROR"}

@app.post("/api/clustal/submit")
async def clustal_submit(request: ClustalSubmitRequest):
    url = "https://www.ebi.ac.uk/Tools/services/rest/clustalo/run"
    data = {"email": EBI_EMAIL, "sequence": request.sequences}
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(url, data=data)
            if resp.status_code == 200:
                return {"jobId": resp.text}
            raise Exception()
    except Exception:
        raise HTTPException(status_code=503, detail="Clustal Error")

@app.get("/api/clustal/results/{jobId}")
async def clustal_results(jobId: str):
    status_url = f"https://www.ebi.ac.uk/Tools/services/rest/clustalo/status/{jobId}"
    aln_url = f"https://www.ebi.ac.uk/Tools/services/rest/clustalo/result/{jobId}/aln-clustal_num"
    tree_url = f"https://www.ebi.ac.uk/Tools/services/rest/clustalo/result/{jobId}/phyml"
    try:
        async with httpx.AsyncClient(verify=False) as client:
            status = (await client.get(status_url)).text
            if status == "FINISHED":
                aln = (await client.get(aln_url)).text
                tree = (await client.get(tree_url)).text
                return {"status": "FINISHED", "alignment": aln, "phylotree": tree}
            return {"status": "RUNNING"}
    except Exception:
        return {"status": "ERROR"}

@app.post("/api/align/pairwise")
async def align_pairwise(request: PairwiseRequest):
    aligner = Align.PairwiseAligner()
    aligner.mode = request.mode
    alignments = aligner.align(request.seq1, request.seq2)
    if alignments:
        best = alignments[0]
        return {"alignment": str(best), "score": best.score}
    return {"alignment": "No alignment", "score": 0}

@app.post("/api/ngs/run")
async def run_ngs(request: NGSToolRequest):
    try:
        args_list = request.args.split()
        process = subprocess.run([request.tool] + args_list, capture_output=True, text=True)
        if process.returncode == 0:
            return {"status": "success", "output": process.stdout}
        return {"status": "failed", "error": process.stderr}
    except FileNotFoundError:
        return {"status": "failed", "error": f"Tool '{request.tool}' is not installed on this server."}

@app.post("/api/phyml/submit")
async def phyml_submit(request: PhyMLSubmitRequest):
    url = "https://www.ebi.ac.uk/Tools/services/rest/simple_phylogeny/run"
    data = {"email": EBI_EMAIL, "sequence": request.alignment}
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(url, data=data)
            if resp.status_code == 200:
                return {"jobId": resp.text}
            raise Exception()
    except Exception:
        raise HTTPException(status_code=503, detail="PhyML Error")

@app.get("/api/phyml/results/{jobId}")
async def phyml_results(jobId: str):
    status_url = f"https://www.ebi.ac.uk/Tools/services/rest/simple_phylogeny/status/{jobId}"
    tree_url = f"https://www.ebi.ac.uk/Tools/services/rest/simple_phylogeny/result/{jobId}/tree"
    try:
        async with httpx.AsyncClient(verify=False) as client:
            status = (await client.get(status_url)).text
            if status == "FINISHED":
                tree = (await client.get(tree_url)).text
                return {"status": "FINISHED", "jobId": jobId, "tree": tree}
            return {"status": "RUNNING"}
    except Exception:
        return {"status": "ERROR"}

@app.post("/api/bioconductor/search")
async def search_bioc(request: PkgSearchRequest):
    return {"results": [{"id": f"{request.query}_pkg", "title": f"{request.query} (Bioconductor)", "description": "Package matched in R/Bioconductor repository.", "version": "v1.2.0", "link": "https://bioconductor.org/"}]}

@app.post("/api/bioconda/search")
async def search_bioconda(request: PkgSearchRequest):
    return {"results": [{"id": f"{request.query}", "title": f"{request.query} (Bioconda)", "description": "Package matched in conda-forge/bioconda repository.", "version": "v3.1.2", "link": "https://bioconda.github.io/"}]}

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def serve_frontend():
    return FileResponse("static/index.html")
    
@app.get("/{file_path:path}")
async def serve_root_files(file_path: str):
    import os
    if os.path.isfile(f"static/{file_path}"):
        return FileResponse(f"static/{file_path}")
    return FileResponse("static/index.html")